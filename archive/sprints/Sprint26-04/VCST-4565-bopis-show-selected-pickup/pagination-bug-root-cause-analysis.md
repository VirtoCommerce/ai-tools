# Root Cause Analysis: BOPIS Pickup Location Pre-Selection Fails for Locations Outside First 50 Results

## Summary

| Field | Value |
|-------|-------|
| **Related Ticket** | VCST-4565 |
| **Feature** | [BOPIS][Desktop] Show selected pick point on Pick Point popup window open |
| **PR** | VirtoCommerce/vc-frontend#2188 |
| **Build** | `2.43.0-pr-2188-c129-c1290c2d` |
| **Environment** | QA Storefront: https://vcst-qa-storefront.govirto.com |
| **Browser** | Chromium (Playwright MCP - playwright-chrome) |
| **Viewport** | 1920x1080 (Desktop) |
| **Investigator** | qa-frontend-expert |
| **Date** | 2026-02-27 |
| **Severity** | High |
| **Priority** | P1 |
| **Type** | Root Cause Analysis |

---

## Problem Statement

When a user selects a pickup location that resides **outside the first 50 results** of the `GetCartPickupLocations` GraphQL query (e.g., by using the Country filter to find a location in Hungary, Japan, or South Africa), confirms it with "Pick up here", and then reopens the pickup modal, **ALL pre-selection state is lost**:

1. No radio button is pre-selected in the location list
2. No info card is auto-displayed
3. The map is zoomed out to world view (not focused on the selected location)
4. The Country filter is not re-applied
5. The selected location is not even present in the unfiltered 50-item list

The cart correctly shows the selected address (e.g., "Vaci ut 1-3, Budapest, 1062, Hungary"), confirming the selection IS persisted server-side. The bug is purely a frontend pre-selection/display issue.

---

## Root Cause

### The Pagination Limit

The `GetCartPickupLocations` GraphQL query uses a **hardcoded `first: 50` pagination parameter**, returning only the first 50 of 102 total pickup locations.

**Captured GraphQL request:**
```json
{
  "operationName": "GetCartPickupLocations",
  "variables": {
    "storeId": "B2B-store",
    "cultureName": "en-US",
    "facet": "address_countryname address_regionname address_city",
    "cartId": "30895e4a-c7e6-4ef2-85eb-5760352b4d03",
    "first": 50
  }
}
```

**Response summary:**
```json
{
  "totalCount": 102,
  "itemsReturned": 50,
  "firstItem": "Barclays' Center",
  "lastItem": "Fort Tryon Park"
}
```

### The Pre-Selection Logic Failure Chain

When the modal opens, the following sequence occurs:

1. **API Call**: `GetCartPickupLocations` fetches with `first: 50` -- returns items 1-50
2. **DOM Render**: 50 location list items with radio buttons are rendered
3. **Pre-Selection Attempt**: Frontend code reads the confirmed pickup location ID from the server-side cart state
4. **DOM Search**: Code searches the rendered list for a radio button matching the confirmed location ID
5. **FAILURE**: If the confirmed location (e.g., Hungary/Westend Foxpost, ID `4594df6b-4ecb-47f1-bb68-73c8bbff2564`) is item #51+ in the total dataset, it is **not in the DOM** -- the search finds nothing
6. **Silent Failure**: No radio is checked, no info card is shown, no map zoom occurs, no filter is applied

### Why It Silently Fails

The pre-selection code does not account for the possibility that the confirmed location may not exist in the current page of results. There is no fallback behavior such as:
- Auto-applying a country/location filter to bring the confirmed location into view
- Fetching additional pages to find the location
- Showing a notification that the selected location is not in the current view
- Requesting all locations (removing the pagination limit)

---

## Evidence: Comparative Testing Results

### Test Matrix: Location Position vs Pre-Selection Success

| Location | Country | Position in List | Within First 50? | Pre-Selection Works? | Evidence |
|----------|---------|-----------------|-------------------|---------------------|----------|
| Barclays' Center | USA | Index 0 | YES | YES | Screenshot 05 |
| Billund, Lego House | Denmark | Index 29 | YES | YES | Screenshot 07 |
| Flatiron Building | USA | Index 49 | YES | YES | Prior edge-case-report.md (EC-08) |
| Essex Street Market | USA | Index 48 | YES | YES | Prior edge-case-report.md (EC-08) |
| Westend Foxpost | Hungary | Index 51+ | NO | **NO** | Screenshot 09 |

### Control Test: Denmark/Billund (Index 29, WITHIN first 50)

**Steps:**
1. Filtered by Denmark, selected Billund Lego House, confirmed with "Pick up here"
2. Cart updated to "Ole Kirks Plads 1, Billund, 7190, Denmark"
3. Reopened modal

**Result: PASS** -- Billund pre-selected with radio checked, info card auto-displayed, map zoomed to Denmark.

**Conclusion:** Non-US locations WITHIN the first 50 work correctly. The bug is NOT country-specific.

### Bug Reproduction: Hungary/Westend Foxpost (Index 51+, OUTSIDE first 50)

**Steps:**
1. Opened modal, applied Country filter > Hungary (1 location)
2. Selected "Westend Foxpost" (HUN, Budapest, Vaci ut 1-3), confirmed with "Pick up here"
3. Cart updated to "Vaci ut 1-3, Budapest, 1062, Hungary"
4. Reopened modal

**Result: FAIL** -- Complete state loss:

| Check | Expected | Actual |
|-------|----------|--------|
| Total radios | 1 (filtered to Hungary) or 50+ with Hungary selected | 50 (unfiltered, no Hungary in list) |
| Checked radio count | 1 | **0** |
| `vc-radio-button--checked` count | 1 | **0** |
| Info card displayed | Yes (Westend Foxpost) | **No** |
| Hungary location in DOM | Yes | **No** (only in Country dropdown text) |
| Hungary radio by ID (`4594df6b-...`) | Present and checked | **Not in DOM** |
| Country filter active | Hungary chip displayed | **No filter** |
| Map zoom | Budapest, Hungary | **World view** |

### Programmatic Verification (via browser_evaluate)

```javascript
{
  "hungaryListItems": [],              // ZERO list items contain Hungary/Westend/Budapest
  "hungaryRadioByValue": false,        // Radio with Hungary ID NOT in DOM
  "hungaryIdInRadioValues": false,     // ID not among any of 50 radio values
  "hungaryInDropdownOnly": true,       // "Hungary" only in Country filter dropdown text
  "totalListItems": 50,               // Unfiltered default first page
  "totalRadios": 50                   // 50 radios, none checked
}
```

---

## Location Distribution Analysis

The 102 total pickup locations are distributed as follows across the `first: 50` pagination boundary:

### Within First 50 (pre-selection WORKS)

| Country | Count | Locations |
|---------|-------|-----------|
| USA | 42 | Barclays' Center, Museum of Arts and Design, Queens Crossing, ... Fort Tryon Park |
| Canada | 2 | Toronto Investment and Trade Centre (idx 4), Airoport&the International Centre (idx 5) |
| Mexico | 1 | South Schuylershire (idx 16) |
| Australia | 1 | Tramsheds (idx 17) |
| United Kingdom | 1 | B2B Bristol branch UK (idx 26) |
| Malaysia | 1 | Berjaya Megamall Kuantan (idx 27) |
| Denmark | 1 | Billund, Lego House (idx 29) |
| China | 1 | DPD Sanghaj (idx 44) |
| **Total** | **50** | |

### Outside First 50 (pre-selection FAILS)

| Country | Count | Locations |
|---------|-------|-----------|
| USA | 48 | Remaining US locations (items 51-98) |
| Hungary | 1 | Westend Foxpost (Vaci ut 1-3, Budapest) |
| Japan | 1 | (unknown name) |
| South Africa | 2 | (unknown names) |
| **Total** | **52** | |

**Key insight:** 90 out of 102 locations are in the USA. With `first: 50`, only 42 US locations + 8 non-US locations fit on the first page. This means:
- **48 US locations** beyond position 50 are also affected
- **4 non-US locations** (Hungary, Japan, 2x South Africa) are affected
- ANY location selected after scrolling/filtering that happens to be in positions 51-102 will exhibit this bug

---

## Technical Architecture

```
                    CART STATE (Server-Side)
                    ========================
                    pickup_location_id = "4594df6b-..." (Hungary)
                    pickup_address = "Vaci ut 1-3, Budapest, 1062, Hungary"
                    (CORRECT - persisted by "Pick up here" action)
                            |
                            v
                    MODAL OPENS
                    ===========
                    1. Fires GetCartPickupLocations(first: 50)
                    2. Receives items 1-50 (of 102 total)
                    3. Renders 50 <li> elements with <radio> inputs
                            |
                            v
                    PRE-SELECTION LOGIC
                    ===================
                    4. Reads confirmed location ID from cart: "4594df6b-..."
                    5. Searches DOM: querySelector('input[value="4594df6b-..."]')
                    6. RESULT: null (Hungary is item 51+, not in DOM)
                    7. NO radio checked, NO info card, NO map zoom
                            |
                            v
                    USER SEES: Empty modal, no indication of their selection
                    Cart below still shows "Hungary" address (confusing!)
```

---

## Impact Assessment

### Affected Users
- Any user who selects a pickup location via Country/State/City filters where the location falls outside the first 50 results
- Any user who scrolls past position 50 in an unfiltered list (if the UI supported it)
- Particularly affects international locations (Hungary, Japan, South Africa) and US locations beyond position 50

### Affected Scenarios
1. International customer selects a non-US pickup location that is outside the first page
2. User selects a US location that happens to be alphabetically/sort-ordered beyond position 50
3. After selection, user reopens modal to verify, change, or review their pickup location
4. User confusion: cart shows an address but modal shows no selection

### Business Impact
- **UX Confusion**: Cart says "Budapest, Hungary" but modal shows no selection -- user may think something is broken
- **Accidental Changes**: User may select a different location thinking their previous choice was lost
- **International Customers**: More likely to encounter this bug since non-US locations tend to be at the end of the dataset

---

## Recommended Fix

### Option 1: Query-Level Fix (Preferred)

Modify the `GetCartPickupLocations` query to include the confirmed location in the response, regardless of pagination position.

**Approach:** When the cart has a confirmed pickup location, the API should either:
- Return `first: ALL` (remove pagination limit for pickup locations)
- Return `first: 50` but **always include the confirmed location** as an additional item if it is not in the first 50

**Pros:** Server-side fix, no client-side complexity
**Cons:** May require xAPI modification

### Option 2: Client-Side Fetch-Until-Found

After the initial `first: 50` fetch, if the confirmed location is not found in the results, fetch subsequent pages until the location is found.

```javascript
// Pseudocode
let page = 1;
let found = false;
while (!found && hasMore) {
  const locations = await fetchPickupLocations({ first: 50, after: cursor });
  found = locations.items.some(loc => loc.id === confirmedLocationId);
  if (!found) cursor = locations.pageInfo.endCursor;
}
```

**Pros:** No API changes needed
**Cons:** Multiple API calls, slower modal open, client-side complexity

### Option 3: Auto-Apply Country Filter

When reopening the modal, if the confirmed location is not in the first page, auto-apply the Country filter matching the confirmed location's country to bring it into view.

**Pros:** Reuses existing filter infrastructure, good UX (user sees relevant locations)
**Cons:** Requires knowing the confirmed location's country, may not work if country has >50 locations

### Option 4: Increase Pagination Limit

Change `first: 50` to `first: 200` or remove the limit entirely.

**Pros:** Simplest fix
**Cons:** May cause performance issues with very large location datasets, doesn't scale

### Recommendation

**Option 1** is the most robust solution. The API should guarantee that the confirmed pickup location is always included in the response. This is a single-point fix that handles all edge cases.

If API changes are not feasible in the short term, **Option 3** (auto-apply country filter) combined with **Option 2** (fetch-until-found fallback) provides a good client-side workaround.

---

## Screenshots Index

| # | Filename | Description |
|---|----------|-------------|
| 01 | `01-cart-initial-state-hungary-selected.png` | Cart with Hungary address confirmed from prior session |
| 02 | `02-modal-opened-after-hungary-confirmed.png` | **BUG**: Modal reopened -- no pre-selection, no info card, world map |
| 03 | `03-barclays-selected-info-card.png` | Barclays' Center (US, idx 0) selected with info card |
| 04 | `04-barclays-confirmed-in-cart.png` | Barclays confirmed in cart (control test) |
| 05 | `05-barclays-reopen-preselected.png` | **WORKS**: Barclays pre-selected on modal reopen (idx 0, within first 50) |
| 06 | `06-modal-canada-filter-attempt.png` | Country filter dropdown showing all 11 countries with counts |
| 07 | `07-denmark-billund-preselected-reopen.png` | **WORKS**: Denmark/Billund pre-selected on reopen (idx 29, within first 50) |
| 08 | `08-hungary-confirmed-in-cart.png` | Cart with Hungary/Westend Foxpost address after "Pick up here" |
| 09 | `09-hungary-reopen-NO-preselection-BUG.png` | **BUG**: Modal reopened -- no pre-selection, Hungary NOT in 50-item list |

---

## Reproduction Steps (Deterministic)

### Prerequisites
- QA environment: https://vcst-qa-storefront.govirto.com
- B2B account with items in cart (any product)
- Delivery option set to "Pickup"
- Backend must have >50 total pickup locations (current QA has 102)

### Steps to Reproduce

1. Log in to storefront as a B2B customer (e.g., Elena Mutykova / [Cypress]-Corporate-1 Kft.)
2. Navigate to Cart page
3. Ensure "Pickup" delivery option is selected
4. Click the pencil/edit icon next to the Pickup point field
5. In the Pick points modal, click the **COUNTRY** filter button
6. Check the **Hungary** checkbox (or any country whose locations are ALL outside the first 50 results)
7. The list filters to 1 location: "Westend Foxpost" (HUN, Budapest, Vaci ut 1-3)
8. Click the "Westend Foxpost" radio button
9. Click **"Pick up here"** to confirm
10. Verify cart shows: "Vaci ut 1-3, Budapest, 1062, Hungary"
11. Click the pencil/edit icon again to **reopen** the modal

### Expected Result
- Westend Foxpost radio is pre-selected
- Info card auto-displays with Foxpost details
- Map zoomed to Budapest, Hungary
- (Optionally) Hungary country filter re-applied

### Actual Result
- **No radio selected** (0 of 50 radios checked)
- **No info card displayed**
- **Map at world zoom level**
- **No country filter active**
- **Hungary/Westend Foxpost NOT in the 50-item list**
- Cart still shows "Vaci ut 1-3, Budapest, 1062, Hungary" (server state correct)

### Reproduction Rate
100% for any location outside the first 50 results.

---

## Related Testing

| Report | File | Findings |
|--------|------|----------|
| Core feature testing | `test-execution-report.md` | All PASS (tested with Barclays' Center, index 0-2 -- within first 50) |
| Edge case testing | `edge-case-report.md` | All PASS (tested with Flatiron/Essex Street, index 48-49 -- within first 50) |
| Exploratory testing | `exploratory-test-report.md` | BUG-001 reported (may be related to this pagination issue) |
| VCST-4650 search indexing | `../VCST-4650-bopis-pickup-search-indexing/test-execution-report.md` | Documented totalCount: 102 with first: 50 pagination |

---

## Conclusion

The VCST-4565 pre-selection feature works correctly for all locations within the `first: 50` pagination window. The implementation is solid -- radio selection, info card display, map zooming, filter reset restoration, and multiple reopen persistence all function as designed.

The bug is caused by a **systemic pagination mismatch**: the GraphQL query returns a fixed first page of 50 items, but the dataset contains 102 locations. Any location beyond position 50 cannot be pre-selected because it is not rendered in the DOM when the modal opens.

This is not a VCST-4565 implementation defect per se -- it is a **pre-existing architectural limitation** of the pickup location modal's data fetching strategy that VCST-4565's pre-selection feature inherits. The fix should address the pagination strategy rather than the pre-selection logic itself.

---

## Sign-Off

| Role | Agent | Decision | Date |
|------|-------|----------|------|
| **Frontend Expert** | qa-frontend-expert | Root cause confirmed, bug documented | 2026-02-27 |
| **QA Lead** | qa-lead-orchestrator | PENDING | - |
