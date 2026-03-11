# Exploratory Test Report: VCST-4565 - BOPIS Show Selected Pick Point on Popup Open

## Summary

| Field | Value |
|-------|-------|
| **Ticket** | VCST-4565 |
| **Feature** | [BOPIS][Desktop] Show selected pick point on Pick Point popup window open |
| **PR** | VirtoCommerce/vc-frontend#2188 |
| **Build** | `2.43.0-pr-2188-c129-c1290c2d` |
| **Environment** | QA Storefront: https://vcst-qa-storefront.govirto.com |
| **Browser** | Chromium (Playwright MCP - playwright-chrome) |
| **Viewport** | 1920x1080 (Desktop) |
| **Tester** | qa-frontend-expert (automated via Playwright MCP) |
| **Date** | 2026-02-27 |
| **Test Type** | Exploratory (deep dive after initial regression pass) |
| **Overall Result** | **CONDITIONAL PASS -- 1 Bug, 2 UX Observations** |

---

## Objective

Deep exploratory re-testing of the VCST-4565 feature, going beyond the initial regression test to probe edge cases, interaction sequences, filter/search behavior with pre-selection, delivery method switching, navigation persistence, rapid open/close stability, and visual quality.

---

## Test Environment

- **Logged in as:** Alice May (Computing Tabulating Recording Corporation >> IBM)
- **Cart contents:** 3 items -- Test YALUMBA Y SERIES CHARDONNAY ($1.20), Carriage Bolt 1" Steel ($450.00 / qty 45), Hoodie Base product ($250.00)
- **Delivery method:** Pickup
- **Baseline pickup location:** Flatiron Building - Main_1; Transfer_2 (175 5th Ave, New York, NY 10084)
- **Total pickup locations available:** 50

---

## Exploratory Areas Tested

### Section 1: Login and Initial Setup

Navigated to the storefront, verified login as Alice May under IBM organization. Confirmed the cart page loaded with items and the Pickup delivery method was active.

**Result:** PASS -- Environment ready for testing.

**Evidence:** Screenshot 01, 02

---

### Section 2: Core Feature Exploration -- Pre-selection Verification

Opened the Pick Points modal from the cart and verified the pre-selection feature for the Flatiron Building location (index 49 of 50 in the list).

**Verified behaviors:**
- Radio button at index 49 is filled/checked (CSS class `vc-radio-button--checked`)
- Info card automatically displayed with full details:
  - Location name: "Flatiron Building - Main_1; Transfer_2"
  - Delivery estimate: "Delivery 2-3 days [global transfer]"
  - Address: USA, New York, 175 5th Ave
  - Working hours: Mon - Sun: 9 - 18
  - Contact phone: +10000000064
  - Contact email: pickup84@example.com
  - Description: Attraction
- Map centered on Manhattan/Flatiron Building coordinates
- List auto-scrolled to position ~4316px to bring Flatiron Building into view
- CANCEL and PICK UP HERE buttons both visible in the info card

**Result:** PASS -- Core pre-selection feature works correctly.

**Evidence:** Screenshots 03, 11, 12, 13

---

### Section 3: Interaction Exploration -- Cancel and X Button Behaviors

#### 3a. Info Card Cancel Button

Tested selecting a different location (Museum of Arts and Design) while the modal was open, then clicking the Cancel button on the info card.

**Finding (UX Observation):** The Cancel button only dismisses the info card overlay. It does NOT revert the radio selection back to the previously confirmed pickup point. The Museum of Arts and Design radio remains selected visually within the modal after Cancel is clicked.

**Impact:** Low -- This is a UX design decision, not a functional bug. The actual cart pickup location is only changed when "Pick up here" is confirmed. However, the Cancel button label may mislead users into thinking it reverts their selection.

**Evidence:** Screenshots 05, 06, 07

#### 3b. Modal X (Close) Button -- CRITICAL BUG FOUND

**BUG: Closing modal via X button after changing radio selection (without confirming) saved an unexpected/wrong location to the cart.**

**Steps to Reproduce (from Session 1):**
1. Cart has Flatiron Building as confirmed pickup point
2. Open Pick Points modal -- Flatiron is pre-selected (correct)
3. Click on "Museum of Arts and Design" in the list -- radio switches to Museum
4. Click info card Cancel button -- info card closes, Museum radio remains selected
5. Click X (close) button on the modal header to close the modal
6. **Expected:** Cart should still show Flatiron Building (175 5th Ave) -- the original confirmed location
7. **Actual:** Cart showed "Ole Kirks Plads 1, Billund, 7190, Denmark" (Billund, Lego House) -- which was NEITHER the original Flatiron selection NOR the in-modal Museum selection

**Severity:** High -- The wrong pickup location was silently saved to the cart. This could lead to customers unknowingly ordering with an incorrect pickup point.

**Additional Context:**
- In a subsequent test (Session 2), closing the modal via X button when NO in-modal selection change was made (only filters/search were used) correctly preserved the original Flatiron address. This suggests the bug is specifically triggered when a radio selection change is made within the modal and then the modal is closed via X without confirming.

**Evidence:** Screenshot 08 (wrong location in cart), Screenshot 09 (modal reopened showing Billund pre-selected)

---

### Section 4: Filter Interactions with Pre-selection

#### 4a. Country Filter Hiding the Pre-selected Location

Applied the Denmark country filter, which hides the pre-selected Flatiron Building (a USA location). Only 1 result appeared: "Billund, Lego House."

**Verified behaviors:**
- The Billund radio was NOT automatically checked -- correct behavior (filtering should not auto-select)
- Info card was NOT visible -- correct (no selection means no info card)
- CANCEL/PICK UP HERE buttons were NOT present -- correct
- "Denmark" chip appeared with X close button
- "Reset filters" button appeared
- Map zoomed to Denmark area

**Result:** PASS -- Correct behavior when filter hides the pre-selected location.

**Evidence:** Screenshot 14

#### 4b. Filter Reset -- Pre-selection Restoration

Clicked "Reset filters" to restore the full list.

**Finding (UX Observation):** After filter reset, the Flatiron Building radio IS correctly restored to checked state at index 49, and the list scroll position is preserved at ~4316px. However, the **info card does NOT automatically reappear** even though the radio selection is restored.

**Expected behavior:** When a previously confirmed pickup point becomes visible again after filters are cleared, the info card should ideally reappear to match the initial modal-open state (where the info card auto-displays for the pre-selected location).

**Impact:** Low-Medium -- The user can still see the filled radio button indicating their selection, but the info card (with address details, map centering, and action buttons) is missing. This creates an inconsistent experience between the initial modal open (info card visible) and the post-filter-reset state (info card hidden).

**Result:** CONDITIONAL PASS -- Radio selection preserved, but info card missing after filter reset.

**Evidence:** Screenshot 15

#### 4c. Search Interaction with Pre-selection

Typed "Flatiron" in the search field and clicked Search.

**Verified behaviors:**
- 1 result returned: "Flatiron Building - Main_1; Transfer_2"
- Radio button was still checked -- pre-selection preserved through search
- Clearing the search restored the full list with Flatiron still checked

**Result:** PASS -- Pre-selection persists through search and search clearing.

**Evidence:** Screenshot 16

#### 4d. X Close After Filter/Search (No Selection Change)

After performing filter and search operations (without changing the radio selection), closed the modal via X button.

**Verified:** Cart still shows "175 5th Ave, New York, New York, 10084, United States of America" -- Flatiron preserved correctly.

**Key difference from the bug in Section 3b:** No in-modal radio selection change was made. Only filters and search were used. The X close correctly preserved the original location in this case.

---

### Section 5: Delivery Method Switching

#### 5a. Pickup to Shipping

Clicked the "Shipping" button to switch delivery method.

**Verified behaviors:**
- Pickup point field replaced by Shipping address + Delivery method fields
- Shipping cost changed from $0.00 to $150.00
- Total increased from $840.00 to $1,020.00 (approximate, with tax recalculation)
- Fixed Rate (Ground) shipping method displayed

**Result:** PASS

**Evidence:** Screenshot 17

#### 5b. Shipping Back to Pickup

Clicked the "Pickup" button to switch back.

**Verified behaviors:**
- Cart shows "175 5th Ave, New York, New York, 10084, United States of America" -- Flatiron remembered
- Shipping cost returned to $0.00
- Total returned to $840.00
- Pickup location correctly persisted through the delivery method roundtrip

**Result:** PASS -- Pickup location survives Pickup -> Shipping -> Pickup switching.

**Evidence:** Screenshot 18

---

### Section 6: Edge Cases

#### 6a. Navigate Away and Back to Cart

Navigated to the homepage (https://vcst-qa-storefront.govirto.com/) and then back to the cart page (https://vcst-qa-storefront.govirto.com/cart).

**Verified:** Cart loaded with "175 5th Ave, New York, New York, 10084, United States of America" still displayed as the pickup point. The selection is persisted server-side (or in session), not just in local component state.

**Result:** PASS

**Evidence:** Screenshots 19, 20

#### 6b. Rapid Open/Close Modal Cycling

Performed 3 rapid open-close cycles of the Pick Points modal (800ms open, 500ms close intervals).

**Verified behaviors:**
- All 3 cycles: modal opened and closed successfully
- No JavaScript errors during rapid cycling
- Cart address after all cycles: "175 5th Ave, New York, New York, 10084, United States of America" -- preserved correctly
- No visual artifacts, flickering, or stale state

**Result:** PASS -- Modal is stable under rapid interaction.

#### 6c. Console Error Monitoring

Monitored console messages throughout the entire exploratory session.

| Metric | Value |
|--------|-------|
| Total console messages | 189 |
| JavaScript errors | **0** |
| Warnings | 87 (all Google Maps `<gmp-pin>` glyph deprecation -- third-party) |
| Network failures | 0 |

**Result:** PASS -- Zero application-level errors.

---

### Section 7: Visual Quality Assessment

Opened the modal one final time after all edge case testing to assess visual quality.

#### 7a. Radio Button Styling

- Checked radio uses class `vc-radio-button--checked` with `vc-radio-button--size--sm` and `vc-radio-button--label--right`
- Filled/active state clearly distinguishable from unchecked radios (olive/yellow filled circle vs empty circle)
- No visual ambiguity about which location is selected

**Result:** PASS

#### 7b. Info Card Design

- Position: absolute (overlays the list area correctly)
- Background: white (clean, readable)
- Width: 240px, Height: 610px
- Contains all expected sections: location name, delivery estimate, address, working hours, contact phone, contact email, description
- Close (X) button present with pointer cursor
- CANCEL button: white background, muted brown text/border (`rgb(145, 115, 116)`), pointer cursor
- PICK UP HERE button: distinct styling, pointer cursor

**Result:** PASS -- Info card is well-structured and readable.

#### 7c. Map Integration

- Google Maps renders correctly within the modal
- Map centers on the pre-selected location
- Nearby markers visible (Empire State Building, Trader Joe's, etc. near Flatiron)
- Map pan/zoom controls accessible
- "Keyboard shortcuts", "Map data (C) 2026 Google", "Terms", "Report a map error" footer visible

**Result:** PASS

#### 7d. Modal Layout

- Title: "Pick points" (clear heading)
- Three-column layout: list (left), info card (center overlay), map (right)
- Filter row: Country, State/Province, City dropdowns aligned horizontally
- Search field with search button at top right
- X close button at top right corner
- No overflow or clipping issues observed
- Scrollable list with smooth scrolling

**Result:** PASS

**Evidence:** Screenshot 21

---

## Bugs Found

### BUG-001: Modal X Close Saves Wrong Pickup Location After In-Modal Selection Change

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Priority** | P1 |
| **Component** | BOPIS / Pick Points Modal |
| **Browser** | Chromium (Desktop 1920x1080) |
| **Reproducibility** | Reproduced in Session 1; needs additional reproduction attempts |

**Summary:** When a user opens the Pick Points modal, changes the radio selection to a different location (without confirming via "Pick up here"), and then closes the modal via the X button, the cart displays an unexpected third location that was neither the original confirmed selection nor the in-modal browsed selection.

**Steps to Reproduce:**
1. Have a confirmed pickup location in the cart (e.g., Flatiron Building)
2. Open the Pick Points modal -- pre-selection shows correctly
3. Click on a different location in the list (e.g., Museum of Arts and Design) -- radio changes
4. Click Cancel on the info card (optional, info card closes)
5. Click X (close) button on the modal header
6. Observe the pickup address in the cart

**Expected Result:** Cart should show the original confirmed pickup location (Flatiron Building - 175 5th Ave)

**Actual Result:** Cart showed "Ole Kirks Plads 1, Billund, 7190, Denmark" (Billund, Lego House) -- an unrelated location

**Notes:**
- This bug did NOT reproduce when the modal was closed via X without any in-modal selection change (e.g., only filters/search were used). In that case, the original location was correctly preserved.
- The bug may be related to how the component handles uncommitted radio state changes during modal close. A possible race condition or incorrect state reference could be causing a stale or default value to be saved instead of the original confirmed value.

**Evidence:** Screenshots 08, 09 (from `screenshots/desktop/explore/`)

---

## UX Observations

### OBS-001: Cancel Button Does Not Revert Radio Selection

**Description:** The Cancel button in the info card only dismisses the info card overlay. It does not revert the radio button selection to the previously confirmed pickup location. The word "Cancel" may create a user expectation that the selection change is being undone.

**Suggestion:** Consider either (a) renaming "Cancel" to "Close" to set correct expectations, or (b) making Cancel actually revert the radio to the last confirmed selection.

**Impact:** Low

**Evidence:** Screenshot 07

### OBS-002: Info Card Does Not Reappear After Filter Reset

**Description:** When filters hide the pre-selected location and then filters are cleared, the radio button is correctly restored to checked state, but the info card does not automatically reappear. This is inconsistent with the initial modal-open behavior where the info card auto-displays for the pre-selected location.

**Suggestion:** After filter reset, if the previously pre-selected radio is still checked and now visible in the list, re-display the info card automatically to match the initial modal-open experience.

**Impact:** Low-Medium

**Evidence:** Screenshot 15

---

## Comprehensive Findings Summary

| # | Finding | Category | Severity | Status |
|---|---------|----------|----------|--------|
| 1 | Core pre-selection works (radio, info card, map, auto-scroll) | Feature | N/A | CONFIRMED WORKING |
| 2 | Pre-selection persists across multiple modal reopens | Feature | N/A | CONFIRMED WORKING |
| 3 | Pre-selection persists through Pickup<->Shipping switching | Feature | N/A | CONFIRMED WORKING |
| 4 | Pre-selection persists after page navigation (home->cart) | Feature | N/A | CONFIRMED WORKING |
| 5 | Pre-selection radio preserved through country filter apply/reset | Feature | N/A | CONFIRMED WORKING |
| 6 | Pre-selection radio preserved through search and search clearing | Feature | N/A | CONFIRMED WORKING |
| 7 | X close preserves original location when no selection change made | Feature | N/A | CONFIRMED WORKING |
| 8 | Modal stable under rapid open/close cycling (3 cycles) | Stability | N/A | CONFIRMED WORKING |
| 9 | Zero JavaScript errors throughout entire session | Stability | N/A | CONFIRMED WORKING |
| 10 | Filter hides pre-selected location without auto-selecting another | Correctness | N/A | CONFIRMED WORKING |
| 11 | Visual quality of radio states, info card, map, modal layout | Visual | N/A | CONFIRMED WORKING |
| 12 | **X close saves wrong location after in-modal selection change** | **BUG** | **High / P1** | **FAILED** |
| 13 | Cancel button does not revert radio selection | UX Observation | Low | NOTED |
| 14 | Info card does not reappear after filter reset | UX Observation | Low-Medium | NOTED |

---

## Screenshots Index (Exploratory Session)

| # | Filename | Description |
|---|----------|-------------|
| 01 | `01-cart-with-pickup-selected.png` | Cart page with Pickup delivery selected |
| 02 | `02-cart-shipping-details-pickup-selected.png` | Shipping details section showing pickup address |
| 03 | `03-pickup-modal-opened-preselected.png` | Modal opened with pre-selected location, info card, map |
| 04 | `04-modal-scrolled-to-top-selected-not-visible.png` | List manually scrolled to top; info card persists |
| 05 | `05-different-location-selected.png` | Different location (Museum) selected in modal |
| 06 | `06-info-card-closed-modal-still-open.png` | Info card X closed; modal remains open |
| 07 | `07-cancel-did-not-revert-selection.png` | Cancel button did not revert radio selection |
| 08 | `08-cart-after-modal-x-close-unexpected-location.png` | **BUG: Wrong location (Billund) saved to cart after X close** |
| 09 | `09-modal-reopened-check-preselection.png` | Modal reopened showing Billund now pre-selected |
| 10 | `10-current-state-check.png` | Session 2 start: current state verification |
| 11 | `11-flatiron-selected-before-confirm.png` | Flatiron selected with filled radio, info card, map |
| 12 | `12-flatiron-confirmed-in-cart.png` | Flatiron confirmed in cart via "Pick up here" |
| 13 | `13-modal-preselection-confirmed-flatiron.png` | Modal reopened: Flatiron pre-selected correctly |
| 14 | `14-filter-denmark-hides-preselected.png` | Denmark filter applied; Flatiron hidden, no auto-select |
| 15 | `15-filter-reset-preselection-preserved-no-infocard.png` | Filter reset: radio preserved, info card missing |
| 16 | `16-search-flatiron-preselection-preserved.png` | Search "Flatiron": pre-selection preserved |
| 17 | `17-switched-to-shipping.png` | Delivery method switched to Shipping |
| 18 | `18-switched-back-to-pickup-location-remembered.png` | Switched back to Pickup: Flatiron remembered |
| 19 | `19-navigation-away-and-back-pickup-preserved.png` | Cart after homepage->cart navigation |
| 20 | `20-shipping-details-pickup-preserved-after-navigation.png` | Pickup point preserved after navigation |
| 21 | `21-visual-quality-modal-preselection-after-edge-cases.png` | Visual quality: modal with pre-selection after all edge cases |

All screenshots located in: `tests/Sprint26-04/VCST-4565-bopis-show-selected-pickup/screenshots/desktop/explore/`

---

## Recommendation

**CONDITIONAL PASS** -- The core VCST-4565 feature (showing the selected pick point when reopening the popup) works correctly in all tested scenarios. However, the High-severity bug (BUG-001: X close saves wrong location after in-modal selection change) needs investigation and likely a fix before production release.

### Action Items

1. **[Required]** Investigate and fix BUG-001 -- ensure closing the modal via X button always preserves the original confirmed pickup location, regardless of any uncommitted radio selection changes within the modal.
2. **[Suggested]** Consider the Cancel button behavior (OBS-001) -- clarify whether Cancel should revert the selection or just dismiss the card, and update the label accordingly.
3. **[Suggested]** Consider restoring the info card after filter reset (OBS-002) for a consistent user experience.

---

## Sign-Off

| Role | Agent | Decision | Date |
|------|-------|----------|------|
| **Frontend Expert** | qa-frontend-expert | CONDITIONAL PASS (1 bug, 2 UX observations) | 2026-02-27 |
| **QA Lead** | qa-lead-orchestrator | PENDING | - |
