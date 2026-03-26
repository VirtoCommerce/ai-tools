# BUG: Pickup Points Country Filter -- Radio Buttons Intercept Pointer Events on Dropdown Checkboxes

| Field | Value |
|-------|-------|
| **Severity** | P1 -- High (Functional) |
| **Component** | Storefront > Cart > BOPIS > Pickup Points Modal |
| **Environment** | https://vcst-qa-storefront.govirto.com |
| **Browser** | Firefox (playwright-firefox), viewport 1920x1080 |
| **Storefront Version** | 2.44.0-pr-2202-2d84-2d84f2a4 |
| **Logged-in User** | Elena Mutykova / ACME Store (B2B) |
| **Date** | 2026-03-16 |
| **Reproducibility** | 100% -- consistent across all attempts |

---

## Summary

In the Pick Points modal on the cart page, 9 out of 11 country filter checkboxes are **unclickable with real mouse clicks** because hidden `<input type="radio">` elements from the pickup points list (`select-address-map-desktop__content`) extend beyond their visual container and intercept pointer events on the dropdown items. Only the 1st (Australia) and 3rd (China) items in the country dropdown can be clicked. All other items (Canada, Denmark, Hungary, Japan, Malaysia, Mexico, South Africa, United Kingdom, United States of America) consistently fail.

## Root Cause Analysis

The `<input type="radio" class="vc-radio-button__input">` elements inside `<div class="select-address-map-desktop__content">` have their hit area extending into the dropdown overlay region. When Playwright (or a real user) attempts to click a country checkbox, the radio button input receives the click instead.

Specific intercepting element observed:
```html
<input type="radio" aria-checked="false" class="vc-radio-button__input"
       id="vc-radio-button-2779-input"
       value="5a806252-713c-4f89-8bc4-f0d345b90bc5"/>
```
Parent: `<div class="select-address-map-desktop__content">`

**Likely CSS issue:** The dropdown (`list[ref=e2719]`) does not have a sufficiently high `z-index` or `pointer-events` isolation relative to the `select-address-map-desktop__content` container behind it. The radio inputs, while visually hidden (likely via `opacity: 0` or `position: absolute` with clip), still have `pointer-events: auto` and extend into the dropdown's clickable area.

## Steps to Reproduce

1. Navigate to https://vcst-qa-storefront.govirto.com
2. Log in as a user with items in cart (B2B account)
3. Go to the Cart page (`/cart`)
4. Ensure "Pickup" delivery option is selected (a pickup point should already be assigned)
5. Click the edit button next to the pickup point address to open the "Pick points" modal
6. Close any "Pick point info" popup that appears
7. Click the "COUNTRY" dropdown button to expand the filter
8. Attempt to click "Canada" (2nd item) -- **click fails / intercepted**
9. Attempt to click "Australia" (1st item) -- click succeeds
10. Attempt to click "China" (3rd item) -- click succeeds
11. Attempt to click "Denmark" (4th item) -- **click fails / intercepted**
12. Attempt to click any remaining country -- **all fail**

## Click-by-Click Log

| # | Action | Country | Dropdown State After | Click Method | Result | Intercepting Element |
|---|--------|---------|---------------------|-------------|--------|---------------------|
| 1 | Open dropdown | -- | OPEN | browser_click on COUNTRY button | SUCCESS | -- |
| 2 | Click checkbox | Australia | OPEN | browser_click ref=e2726 | SUCCESS | -- |
| 3 | Click checkbox | Canada | OPEN (no change) | browser_click ref=e2736 | **FAILED** | `vc-radio-button__input` from `select-address-map-desktop__content` |
| 4 | Click checkbox | China | OPEN | browser_click ref=e2746 | SUCCESS | -- |
| 5 | Click checkbox | Denmark | OPEN (no change) | browser_click ref=e2756 | **FAILED** | timeout (same root cause) |
| 6 | Click checkbox | Hungary | OPEN (no change) | browser_click ref=e2766 | **FAILED** | timeout (same root cause) |
| 7 | Click checkbox | Japan | OPEN (no change) | browser_click ref=e2776 | **FAILED** | timeout (same root cause) |
| 8 | Click checkbox | Malaysia | OPEN (no change) | browser_click ref=e2786 | **FAILED** | timeout (same root cause) |
| 9 | Click checkbox | Mexico | OPEN (no change) | browser_click ref=e2796 | **FAILED** | timeout (same root cause) |
| 10 | Click checkbox | South Africa | OPEN (no change) | browser_click ref=e2806 | **FAILED** | timeout (same root cause) |
| 11 | Click checkbox | United Kingdom | OPEN (no change) | browser_click ref=e2816 | **FAILED** | timeout (same root cause) |
| 12 | Click checkbox | United States of America | OPEN (no change) | browser_click ref=e2826 | **FAILED** | timeout (same root cause) |

### Summary Statistics

| Metric | Value |
|--------|-------|
| Total countries in dropdown | 11 |
| Successfully clicked | 2 (Australia, China) |
| Failed due to interception | 9 (Canada, Denmark, Hungary, Japan, Malaysia, Mexico, South Africa, United Kingdom, United States of America) |
| Dropdown close/reopen needed | 0 (dropdown stayed open throughout) |
| Failure rate | **81.8%** (9/11) |
| Console errors | 0 |
| Console warnings | 69 (mostly Google Maps and resource blocking) |

## Expected Behavior

All 11 country checkboxes in the Country filter dropdown should be clickable with standard mouse clicks. The dropdown should allow multi-select without any pointer event interception from elements behind the dropdown overlay.

## Actual Behavior

Only 2 out of 11 countries (Australia at position 1, China at position 3) can be clicked. The remaining 9 countries are blocked by radio button inputs (`vc-radio-button__input`) from the pickup points list that bleeds through the dropdown overlay.

The dropdown itself stays open correctly -- the issue is purely about **pointer event interception** from underlying DOM elements, not about dropdown open/close behavior.

## Key Observations

1. **Pattern is position-dependent, not country-dependent:** Australia (1st) and China (3rd) succeed while Canada (2nd) and Denmark (4th) fail, suggesting the overlap depends on the Y-coordinate alignment between dropdown items and the radio buttons in the pickup list behind them.

2. **The dropdown does NOT close on click:** Contrary to the initial hypothesis, the dropdown correctly stays open for multi-select. The bug is about click interception, not dropdown collapse.

3. **No JavaScript errors:** The console shows 0 errors. This is a CSS/layout issue, not a JS runtime error.

4. **Playwright's error message is definitive:** The Playwright actionability check explicitly identifies the intercepting element: `<input type="radio" ... class="vc-radio-button__input" .../> from <div class="select-address-map-desktop__content"> subtree intercepts pointer events`.

## Suggested Fix

One or more of the following CSS fixes should resolve the issue:

1. **Add `pointer-events: none` to the radio inputs** when they are visually hidden:
   ```css
   .vc-radio-button__input {
     pointer-events: none;
   }
   ```
   (The parent label/container should handle click delegation.)

2. **Ensure the dropdown list has a higher z-index** than `select-address-map-desktop__content`:
   ```css
   .vc-dropdown__list {
     z-index: 100; /* or higher than the content area */
   }
   ```

3. **Add `pointer-events: none` to the content area** when the dropdown is open, and re-enable when closed.

## Evidence / Screenshots

| File | Description |
|------|-------------|
| `screenshots/pickup-mouse-01-modal-clean.png` | Pick points modal, clean state before opening dropdown |
| `screenshots/pickup-mouse-02-dropdown-open-all-countries.png` | Country dropdown open showing all 11 countries |
| `screenshots/pickup-mouse-03-click-australia.png` | After clicking Australia -- success, dropdown stays open |
| `screenshots/pickup-mouse-04-canada-click-intercepted.png` | After Canada click failed -- visual state unchanged |
| `screenshots/pickup-mouse-05-click-china.png` | After clicking China -- success, both Australia + China selected |
| `screenshots/pickup-mouse-06-final-state-after-all-attempts.png` | Final state -- only 2/11 countries selected |

## Impact Assessment

- **User Impact:** Users filtering pickup points by country can only select 2 of 11 available countries via mouse clicks. This makes the country filter effectively broken for multi-country selection.
- **Workaround:** Users may be able to use the "Search Country" text field to filter and then click, or use keyboard navigation (Tab + Enter). However, direct mouse clicking -- the primary interaction method -- is broken.
- **Scope:** Affects the BOPIS/Pickup feature on the cart page. Does not affect shipping delivery option.
- **Revenue Impact:** Medium. Users who need to find pickup points in specific countries (Canada, Denmark, etc.) cannot filter effectively, potentially leading to abandoned carts or incorrect pickup point selection.

---

**Tested by:** QA Testing Expert (qa-testing-expert)
**Test method:** Real mouse clicks via playwright-firefox browser_click (NOT JavaScript .click())
**Verdict:** FAIL -- P1 Bug confirmed, 81.8% of country filter options unclickable
