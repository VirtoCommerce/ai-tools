# BUG REPRODUCTION ATTEMPT: Pickup Points Country Filter Dropdown Closes on Each Selection

**Status:** CANNOT REPRODUCE
**Severity:** N/A (Bug not confirmed)
**Component:** Cart > Pickup Points > Country Filter Dropdown
**Browser:** Firefox (Playwright-Firefox, viewport 1920x1080)
**Environment:** https://vcst-qa-storefront.govirto.com
**Storefront Version:** 2.44.0-pr-2202-2d84-2d84f2a4
**Date:** 2026-03-16
**Tested By:** QA Agent (qa-testing-expert)

---

## Reported Issue

The Country filter dropdown in the "Pick points" modal allegedly closes after every single checkbox click, forcing the user to reopen it each time to select another country.

## Reproduction Attempt

### Steps Executed

1. Navigated to https://vcst-qa-storefront.govirto.com (logged in as Elena Mutykova / ACME Store)
2. Navigated to Cart page (`/cart`) -- 7 items in cart
3. Confirmed Pickup delivery option was already selected with pickup point at "Ole Kirks Plads 1, Billund, 7190, Denmark"
4. Clicked the edit (pencil) button to open the "Pick points" modal
5. Closed the auto-opened "Pick point info" popup for Billund
6. Clicked the **COUNTRY** dropdown button -- dropdown opened showing all 11 countries with checkboxes (all unchecked)
7. **Screenshot 01:** Captured dropdown in open state, no selections
8. Clicked **Australia** (first country checkbox)
9. **Screenshot 02:** Captured state immediately after click -- **dropdown STAYED OPEN**
   - Australia row highlighted with filled checkbox
   - COUNTRY button badge updated to "1"
   - Pickup list filtered to 1 result (Tramsheds - Australia)
   - Map moved to Australia
10. Clicked **Canada** (second country checkbox) -- via JS click due to pointer interception from underlying pickup list radio buttons
11. **Screenshot 03:** Captured state -- **dropdown STAYED OPEN**
    - Both Australia and Canada highlighted with filled checkboxes
    - COUNTRY button badge updated to "2"
    - Pickup list filtered to 3 results (2 Canada + 1 Australia)
    - Chips appeared: "Australia", "Canada", "Reset filters"
12. Clicked **China** (third country checkbox)
13. **Screenshot 04:** Captured state -- **dropdown STAYED OPEN**
    - Australia, Canada, China all checked
    - COUNTRY button badge updated to "3"
    - Map zoomed out to world view with pins in Australia, China, and North America

### Result

**The dropdown does NOT close after each selection.** It remains open as expected for a multi-select dropdown, allowing the user to select multiple countries without reopening.

## DOM Analysis

The Country filter is implemented using the following Vue component hierarchy:

| Level | CSS Class | Component |
|-------|-----------|-----------|
| Root | `vc-popover vc-dropdown-menu facet-filter-dropdown` | VcPopover + VcDropdownMenu |
| Trigger wrapper | `vc-popover__trigger` | Popover trigger zone |
| Trigger inner | `vc-dropdown-menu__trigger` | Dropdown menu trigger |
| Button | `vc-button facet-filter-dropdown__trigger` | Trigger button |
| List items | `vc-menu-item__inner` | Individual country options |

The `vc-popover` component manages the open/close state. Each country option is a `button` (not a native checkbox), styled to look like a checkbox row. The popover stays in `[expanded]` state across multiple selections.

## Observations

1. **No "Select All" option** -- confirmed missing. The user must click each country individually. With 11 countries this is tedious but functional.
2. **Pointer event interception** -- when the dropdown list extends beyond the modal's pickup list area, the underlying radio buttons from the pickup point list intercept pointer events. This can make clicking lower items in the country list unreliable. Playwright's click timed out on "Canada" due to `vc-radio-button__input` from the pickup list intercepting the click. A JavaScript `.click()` call succeeded. This suggests a z-index or overlay issue in the dropdown positioning.
3. **Reset filters** button and individual chip close buttons both work correctly for removing selections.
4. **No console errors** -- 0 JS errors across the entire test. Only warnings: Google Maps `<gmp-pin>` deprecation (125 warnings total).
5. **No network failures** -- all GraphQL requests returned HTTP 200. Only 404s are pre-existing flannel shirt image assets (unrelated).

## Possible Explanation for Original Report

The original bug reporter may have experienced one of the following:

1. **Pointer interception issue (most likely):** If the user clicked near the bottom of the dropdown where it overlaps with the pickup list, the click might have been intercepted by a radio button underneath, which would select a pickup point AND cause the dropdown to lose focus/close. This is a real but intermittent UX issue related to dropdown z-index positioning.
2. **Browser-specific behavior:** The original test may have been performed in a different browser or at a different viewport size where the popover positioning behaves differently.
3. **Storefront version difference:** The behavior may have been present in an earlier version and has since been fixed in v2.44.0-pr-2202.

## UX Issues Confirmed (Not the Reported Bug)

While the dropdown-closing bug could not be reproduced, the following UX issues were confirmed during testing:

### 1. Missing "Select All" Option (UX Enhancement)
No "Select All" or "Deselect All" option in the dropdown. Users must click each of the 11 countries individually.

### 2. Pointer Event Interception (Intermittent UX Bug)
The dropdown list can overlap with the pickup points radio buttons underneath. When this overlap occurs, clicks on country options may be intercepted by the radio buttons below, potentially causing unexpected behavior (pickup point selection + dropdown close).

### 3. Previously Reported: Multi-Country Filter Returns Incomplete Results
Selecting all 11 countries shows only 8 of 102+ pickup points. See `BUG-pickup-points-select-all-countries.md` for full details.

## Evidence

### Screenshots

| File | Description |
|------|-------------|
| `pickup-dropdown-00-modal-open.png` | Modal opened with Pick point info popup visible |
| `pickup-dropdown-01-open.png` | Country dropdown open, all 11 countries unchecked |
| `pickup-dropdown-02-first-click-australia.png` | After clicking Australia -- dropdown STAYS OPEN |
| `pickup-dropdown-03-second-click-canada.png` | After clicking Canada -- dropdown STAYS OPEN, badge "2" |
| `pickup-dropdown-04-third-click-china.png` | After clicking China -- dropdown STAYS OPEN, badge "3" |
| `pickup-dropdown-05-reset-state.png` | After reset, all filters cleared, full list restored |

All screenshots saved to `reports/bugs/screenshots/`.

### Console
- **Errors:** 0
- **Warnings:** 125 (exclusively Google Maps `<gmp-pin>` deprecation warnings)

### Network
- **Failed requests:** 0 related to pickup points
- **GraphQL:** All calls returned HTTP 200
- **Pre-existing 404s:** 4 flannel shirt image thumbnails (unrelated)
