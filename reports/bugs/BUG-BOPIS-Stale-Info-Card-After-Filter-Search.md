# Bug Report: BOPIS Pickup Modal - Stale Info Card After Filter/Search

## Summary
The "Pick point info" card in the BOPIS Pickup Location modal displays stale data from a previously selected location when the user applies filters or performs a search that excludes that location from the results.

## Environment
- **URL:** https://vcst-qa-storefront.govirto.com/
- **Browser:** Chrome (latest)
- **Date Reported:** 2026-01-30
- **Tester:** QA Testing Expert Agent

## Severity
**Major** - The bug creates a confusing user experience and could potentially lead to incorrect pickup location selection.

## Priority
**High** - Affects core BOPIS functionality and could result in orders being placed with incorrect pickup locations.

---

## Bug Details

### Scenario 1: Country Filter Applied

**Steps to Reproduce:**
1. Navigate to https://vcst-qa-storefront.govirto.com/
2. Add any product to cart (or use existing cart items)
3. Go to Cart page
4. Ensure "Pickup" delivery option is selected
5. Click the edit button (pencil icon) next to the pickup point to open the "Pick points" modal
6. Select a location from the list (e.g., "Barclays' Center" - a USA location)
7. Wait for the "Pick point info" card to appear on the right side showing location details
8. While the info card is visible, click on "Country" filter dropdown
9. Select "Canada" to filter by Canadian locations only

**Expected Result:**
- The list should show only Canadian locations
- The "Pick point info" card should either:
  - Disappear (since the previously selected location is no longer in the filtered list), OR
  - Update to show a message like "Select a location from the list", OR
  - Auto-select the first available location from the filtered list

**Actual Result:**
- The list correctly shows only Canadian locations (Toronto Investment and Trade Centre, Airoport&the International Centre)
- **BUG:** The "Pick point info" card still displays the Barclays' Center data (USA, New York location)
- The card shows:
  - Title: "Barclays' Center. Amazon pickup point. Work hours M-Sun: 6-24"
  - Address: USA, New York, 620 Atlantic Ave
  - Working hours: Mon - Sun: 9 - 18
  - Contact phone: +10000000054
  - Contact email: pickup54@example.com
  - "Cancel" and "Pick up here" buttons remain active

**Screenshot:** `BUG-05-stale-info-card-after-canada-filter.png`

---

### Scenario 2: Search with No Results

**Steps to Reproduce:**
1. Navigate to https://vcst-qa-storefront.govirto.com/
2. Add any product to cart (or use existing cart items)
3. Go to Cart page
4. Ensure "Pickup" delivery option is selected
5. Click the edit button (pencil icon) next to the pickup point to open the "Pick points" modal
6. Select a location from the list (e.g., "Barclays' Center")
7. Wait for the "Pick point info" card to appear
8. In the Search field, type a non-existent location name (e.g., "XXXXXX123456")
9. Press Enter or click the search button

**Expected Result:**
- The list should show "Pickup points not found." message
- The "Pick point info" card should:
  - Disappear, OR
  - Display a message indicating no location is selected, OR
  - Be disabled/hidden

**Actual Result:**
- The list correctly shows "Pickup points not found." with a "Reset search" button
- The map shows an empty area with no markers
- **BUG:** The "Pick point info" card still displays the Barclays' Center data
- The "Pick up here" button remains active and clickable

**Screenshot:** `BUG-07-search-no-results-stale-info-card.png`

---

## Impact

1. **User Confusion:** Users may be confused seeing pickup location details for a location that is not visible in the current filtered/searched results

2. **Potential Data Integrity Issue:** If a user clicks "Pick up here" while viewing stale data, they might select an unintended location

3. **UX Inconsistency:** The UI shows conflicting information - the list shows no results or filtered results, but the info card shows data for a location not in that list

---

## Recommended Fix

When filters are applied or search is performed:
1. Clear the "Pick point info" card if the previously selected location is no longer in the visible results
2. Optionally, auto-select the first location from the new filtered/searched results
3. If no results are found, hide or disable the info card entirely
4. Consider adding a visual indicator that no location is currently selected

---

## Screenshots Reference

| Step | Screenshot | Description |
|------|------------|-------------|
| 1 | BUG-01-cart-page-initial.png | Cart page with Pickup option selected |
| 2 | BUG-02-pickup-modal-opened.png | Pick points modal opened |
| 3 | BUG-03-location-selected-info-card-shown.png | Barclays' Center selected, info card visible |
| 4 | BUG-04-country-filter-dropdown-open.png | Country filter dropdown open |
| 5 | BUG-05-stale-info-card-after-canada-filter.png | **BUG** - Canada filter applied, stale info card shown |
| 6 | BUG-06-filters-reset-barclays-selected.png | Filters reset, Barclays' Center reselected |
| 7 | BUG-07-search-no-results-stale-info-card.png | **BUG** - No search results, stale info card shown |

---

## Console Errors
No JavaScript errors related to this bug were observed. Only unrelated 404 errors for product images:
- `threecentsCherry-Soda-1-e1585652933596_216x216_md.png`
- `threecentsCherry-Soda-1-e1585652933596_348x348_md.png`

---

## Additional Notes

- The bug is reproducible consistently
- The issue affects both filter and search functionality
- The map correctly updates (zooms to filtered area or shows empty), but the info card does not
- Google Maps API shows deprecation warnings for `<gmp-pin>` component (unrelated to this bug)
