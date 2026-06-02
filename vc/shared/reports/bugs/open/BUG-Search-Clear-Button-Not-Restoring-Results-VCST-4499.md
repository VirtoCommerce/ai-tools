# BUG: Search Clear Button Does Not Restore Pickup Location Results

**Bug ID:** BUG-BOPIS-SearchClear-001
**Jira Ticket:** [VCST-4578](https://virtocommerce.atlassian.net/browse/VCST-4578)
**Related Ticket:** VCST-4499
**Date Reported:** 2026-01-30
**Reporter:** Claude Code QA Automation
**Severity:** Minor
**Priority:** Low

---

## Summary

In the BOPIS Pickup Location modal, clicking the X (clear) button to clear the search field does not restore the full list of pickup locations. The search text is cleared, but the results remain filtered/empty.

---

## Environment

- **URL:** https://vcst-qa-storefront.govirto.com/
- **Version:** Ver. 2.41.0-pr-2138-d99f-d99fc444
- **Browser:** Chrome (tested), WebKit (tested)
- **Viewport:** Desktop (1920x1080), Mobile (375x667)

---

## Steps to Reproduce

1. Navigate to https://vcst-qa-storefront.govirto.com/
2. Add products to cart
3. Go to Cart page
4. Select "Pickup" delivery option
5. Click "Select pickup location" button
6. In the search field, enter a search term (e.g., "Mall")
7. Observe filtered results appear (locations containing "Mall")
8. Click the X (clear) button to clear the search field
9. Observe the results

---

## Expected Result

- Search field is cleared
- Full list of all pickup locations is restored
- Map shows all location markers

---

## Actual Result

- Search field is cleared (text removed)
- Results remain filtered/empty (no locations shown)
- User must click "Reset search" button to restore all locations

---

## Screenshots

| Step | Screenshot |
|------|------------|
| After search "Mall" | `tests/VCST-4499-BOPIS/screenshots/mobile/MOBILE-TC001-02-Map-After-Mall-Search.png` |
| After clicking X (bug) | `tests/VCST-4499-BOPIS/screenshots/mobile/MOBILE-TC001-04-Map-Restored-After-Clear.png` |
| Reset search button | `tests/VCST-4499-BOPIS/screenshots/mobile/MOBILE-TC001-05-List-No-Results-Reset-Button.png` |

---

## Workaround

Click the "Reset search" button that appears when no results are shown. This will restore all pickup locations.

---

## Impact

- **User Experience:** Minor inconvenience - users may be confused when clearing search doesn't show all locations
- **Functionality:** Search functionality works, workaround available
- **Frequency:** Every time user clears search via X button

---

## Suggested Fix

When the X (clear) button is clicked:
1. Clear the search input field (current behavior)
2. Trigger the same action as "Reset search" to restore all locations
3. Update map markers to show all locations

---

## Additional Notes

- This behavior is consistent across desktop and mobile viewports
- The "Reset search" button works correctly as a workaround
- No console errors observed when clicking the X button
- Google Maps API deprecation warnings present but unrelated to this issue

---

## Test Execution Reference

- Desktop Report: `tests/VCST-4499-BOPIS/VCST-4499-BOPIS-Test-Execution-Report.md`
- Mobile Report: `tests/VCST-4499-BOPIS/MOBILE-BOPIS-Test-Execution-Report.md`
