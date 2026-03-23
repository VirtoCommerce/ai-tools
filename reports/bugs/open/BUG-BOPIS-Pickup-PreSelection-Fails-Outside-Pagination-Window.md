# BUG: BOPIS Pickup Location Pre-Selection Fails for Locations Outside First 50 Results

## Summary

**Page:** Cart > Pick points modal
**Flow:** BOPIS Pickup Location Selection > Modal Reopen
**Feature:** VCST-4565 - Show selected pick point on popup open

When a user confirms a pickup location that falls outside the first 50 results returned by the `GetCartPickupLocations` GraphQL query (e.g., locations in Hungary, Japan, South Africa, or US locations beyond position 50), reopening the pickup modal shows NO pre-selection: no radio checked, no info card, no map zoom, no filter applied. The confirmed address IS preserved server-side (visible in the cart), but the modal cannot display it because the location is not in the rendered 50-item list.

## Environment

| Field | Value |
|-------|-------|
| **URL** | https://vcst-qa-storefront.govirto.com/cart |
| **Build** | `2.43.0-pr-2188-c129-c1290c2d` |
| **Browser** | Chromium (Playwright MCP) |
| **Viewport** | 1920x1080 (Desktop) |
| **Date** | 2026-02-27 |

## Steps to Reproduce

1. Log in as B2B customer (e.g., Elena Mutykova / [Cypress]-Corporate-1 Kft.)
2. Navigate to Cart page with items
3. Select "Pickup" delivery option
4. Click the edit (pencil) icon next to Pickup point
5. In the Pick points modal, click **COUNTRY** filter button
6. Check the **Hungary** checkbox
7. List filters to 1 location: "Westend Foxpost" (HUN, Budapest, Vaci ut 1-3)
8. Click the Westend Foxpost radio button
9. Click **"Pick up here"** to confirm
10. Verify cart shows: "Vaci ut 1-3, Budapest, 1062, Hungary"
11. Click the edit (pencil) icon to **reopen** the modal

## Expected Result

- Westend Foxpost radio is pre-selected (checked)
- Info card auto-displays with location details (address, phone, email, hours)
- Map zoomed to Budapest, Hungary
- Hungary country filter ideally re-applied (or location visible in list)

## Actual Result

- **No radio selected** (0 of 50 radios checked)
- **No info card displayed**
- **Map at world zoom level** (not focused on Budapest)
- **No country filter active**
- **Westend Foxpost (Hungary) NOT in the 50-item list** -- it is outside the `first: 50` pagination window
- Cart below still correctly shows "Vaci ut 1-3, Budapest, 1062, Hungary"

## Root Cause

The `GetCartPickupLocations` GraphQL query uses `first: 50`, returning only items 1-50 of 102 total locations. The pre-selection logic searches the DOM for the confirmed location's radio button. Since Hungary (item 51+) is not rendered, the search returns null and silently fails.

**This is a pagination mismatch bug, not a pre-selection logic bug.** The pre-selection code works correctly for all locations within the first 50 results (verified with US, Denmark, Canada, Malaysia, UK, Australia, China, Mexico locations).

## Comparative Evidence

| Location | Country | List Position | In First 50? | Pre-Selection? |
|----------|---------|--------------|--------------|----------------|
| Barclays' Center | USA | Index 0 | Yes | WORKS |
| Billund, Lego House | Denmark | Index 29 | Yes | WORKS |
| Flatiron Building | USA | Index 49 | Yes | WORKS |
| Westend Foxpost | Hungary | Index 51+ | **No** | **FAILS** |

## Screenshots

All screenshots in: `tests/Sprint26-04/VCST-4565-bopis-show-selected-pickup/screenshots/desktop/scroll-bug-investigation/`

| Evidence | File |
|----------|------|
| Cart with Hungary address confirmed | `08-hungary-confirmed-in-cart.png` |
| **BUG: Modal reopened, no pre-selection** | `09-hungary-reopen-NO-preselection-BUG.png` |
| Control: Denmark pre-selection WORKS | `07-denmark-billund-preselected-reopen.png` |
| Control: US Barclays pre-selection WORKS | `05-barclays-reopen-preselected.png` |

## Console Errors

0 JavaScript errors. 146 console warnings (all Google Maps `<gmp-pin>` deprecation -- third-party, non-blocking).

## Impact

- **Affected locations:** 52 of 102 total pickup locations (all beyond position 50)
- **Affected countries:** Hungary (1), Japan (1), South Africa (2), plus 48 US locations
- **User experience:** Confusing -- cart says "Hungary" but modal shows no selection. User may accidentally re-select a different location.
- **Data integrity:** No data loss -- server-side cart state is correct. Bug is display-only.

## Suggested Fix

**Preferred:** Modify the API/query to always include the confirmed pickup location in the response, regardless of pagination position. Alternatively, auto-apply the country filter when reopening the modal if the confirmed location is not in the default first page.

See full analysis: `tests/Sprint26-04/VCST-4565-bopis-show-selected-pickup/pagination-bug-root-cause-analysis.md`

## Reproduction Rate

100% for any location outside the first 50 results.

## Severity & Priority

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Priority** | P1 |
| **Type** | Bug |
| **Labels** | frontend, bopis, pickup, pagination, pre-selection |
| **Component** | Cart / BOPIS Modal |
| **Affects Version** | 2.43.0 |
| **Related Ticket** | VCST-4565 |
