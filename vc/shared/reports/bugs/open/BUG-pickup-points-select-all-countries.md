# BUG: Selecting all countries in Pickup Points filter shows only 8 out of 102 locations

**Severity:** High
**Component:** Cart > Pickup Points > Country Filter
**Browser:** Firefox (Playwright-Firefox, viewport 1920x1080)
**Environment:** https://vcst-qa-storefront.govirto.com
**Storefront Version:** 2.44.0-pr-2202-2d84-2d84f2a4
**Date:** 2026-03-16
**Reported By:** QA Agent (qa-testing-expert)

## Summary

When all 11 countries are selected in the Country filter of the "Pick points" modal on the cart page, only 8 pickup points are displayed. With no filter applied (after reset), 100+ pickup points are shown. Selecting all countries should produce the same result as no filter, but instead it dramatically reduces the results -- dropping 94 locations (92% of all pickup points).

## Steps to Reproduce

1. Navigate to https://vcst-qa-storefront.govirto.com and log in
2. Ensure the cart has at least one physical product (items already present)
3. Go to the Cart page (`/cart`)
4. In the "Shipping details" section, click the **Pickup** delivery option button
5. Click the edit (pencil) button next to the selected pickup point to open the "Pick points" modal
6. Click the **COUNTRY** dropdown filter
7. Select **all 11 countries** one by one: Australia, Canada, China, Denmark, Hungary, Japan, Malaysia, Mexico, South Africa, United Kingdom, United States of America
8. Observe the pickup points list

## Expected Result

Selecting all 11 countries should display ALL pickup points (102 total, matching the sum of counts shown in the dropdown: 1+2+1+1+1+1+1+1+2+1+90 = 101). The result should be equivalent to having no country filter applied at all.

## Actual Result

Only **8 pickup points** are displayed when all 11 countries are selected:

1. Airoport & the International Centre (Canada)
2. Berjaya Megamall Kuantan (Malaysia)
3. Billund, Lego House (Denmark) -- currently selected
4. DPD - Sanghaj (China)
5. KYOTO AEON MALL KUMIYAMA (Japan)
6. Toronto Investment and Trade Centre (Canada)
7. Tramsheds - Australia (Australia)
8. Westend Foxpost (Hungary)

**Missing entirely:** All 90 United States locations, Mexico (1), South Africa (2), United Kingdom (1) = 94 missing pickup points.

The pattern of what IS shown: one location per country that has exactly 1 location (Australia, China, Denmark, Hungary, Japan, Malaysia), plus both Canada locations (2). Countries with more locations (USA=90, South Africa=2) or certain single-location countries (Mexico, UK) are missing entirely.

## Additional Observations

### UI Issue: Chip overflow
When all 11 countries are selected, the filter chip row wraps to a second line. While the chips are all visible, they consume significant vertical space and push the pickup list content down, reducing the visible area. The chip container has `overflow: visible` and zero-dimension bounding box in some states.

### Map does not adjust
The Google Maps component remains zoomed into the previously selected location (Billund, Denmark) rather than adjusting its viewport to show all pickup points from all selected countries. After reset, the map also remains at Billund.

### Dropdown behavior
**UPDATE (2026-03-16, re-test):** The Country dropdown does NOT close after each selection. A dedicated reproduction attempt confirmed the dropdown stays open as expected for multi-select. The `vc-popover` component correctly maintains `[expanded]` state across multiple clicks. However, a **pointer event interception issue** was identified: when the dropdown list extends beyond the modal content area, underlying pickup-point radio buttons (`vc-radio-button__input`) can intercept clicks, potentially causing the dropdown to lose focus. This may have caused the originally observed closing behavior. See `BUG-pickup-filter-dropdown-closes-on-select.md` for full reproduction report.

**Confirmed UX gap:** There is no "Select All" option. Users must click each of the 11 countries individually.

### Performance
Each country selection triggers a map re-render, generating a `<gmp-pin>` deprecation warning from Google Maps. With 11 selections, this produces ~112 warnings. No JavaScript errors were observed.

### Network
- All GraphQL requests returned HTTP 200 (no 4xx/5xx errors)
- Multiple GraphQL calls were made during filter interactions
- 4 image 404 errors for flannel shirt product thumbnails (pre-existing, unrelated to this bug)
- No failed API calls related to the pickup points filter

## Root Cause Hypothesis

The multi-country filter likely uses an OR-based query but may have a logical error in how multiple country codes are combined. Possible causes:
1. The GraphQL query for fetching filtered fulfillment centers may not correctly handle 11 simultaneous country filter values
2. There may be a pagination/limit that kicks in when multiple countries are selected, capping results at a low number
3. The filter may be applying AND logic instead of OR when combining country selections, causing countries with overlapping data to drop out

## Evidence

### Screenshots
- `reports/bugs/screenshots/pickup-filter-01-homepage.png` -- Homepage loaded state
- `reports/bugs/screenshots/pickup-filter-02-modal-open.png` -- Modal opened with info popup
- `reports/bugs/screenshots/pickup-filter-03-modal-clean.png` -- Modal in clean state (no filters, pre-action baseline)
- `reports/bugs/screenshots/pickup-filter-04-country-dropdown-open.png` -- Country dropdown expanded showing all 11 options
- `reports/bugs/screenshots/pickup-filter-05-all-countries-selected.png` -- All countries selected, dropdown still open (shows checkmarks on all 11)
- `reports/bugs/screenshots/pickup-filter-06-all-selected-chips-overflow.png` -- **BUG STATE** -- All 11 chips visible, only 8 pickup points in list

### Console errors
None (0 JS errors). 195 warnings total, predominantly Google Maps `<gmp-pin>` deprecation warnings.

### Network errors
No API failures related to pickup points. All GraphQL calls returned 200.

## Impact

- **User impact:** A customer selecting multiple or all countries in the BOPIS filter will see an incomplete list of pickup locations, potentially missing their preferred or nearest pickup point
- **Business impact:** Customers may abandon the checkout flow or select a suboptimal pickup location because their preferred one is not visible
- **Scope:** Affects the Cart > Pickup delivery option on the storefront; any user who uses the country filter with multiple selections

## Workaround

Users can work around this by NOT using the country filter (leaving it unselected shows all locations), or by selecting only a single country at a time.

## Related Issues

### Dropdown Closes on Select (CANNOT REPRODUCE)
A separate report alleged the Country dropdown closes after every checkbox click. Re-testing on 2026-03-16 (v2.44.0-pr-2202) confirmed the dropdown stays open correctly. A pointer event interception issue with underlying radio buttons was identified as a possible cause of the originally observed behavior. Full report: `reports/bugs/BUG-pickup-filter-dropdown-closes-on-select.md`.

### DOM Component Structure (for debugging reference)
The Country filter uses `vc-popover > vc-dropdown-menu > facet-filter-dropdown` component hierarchy. Each country option is a styled `button` with class `vc-menu-item__inner`. The popover trigger manages open/close via the `[expanded]` ARIA attribute.
