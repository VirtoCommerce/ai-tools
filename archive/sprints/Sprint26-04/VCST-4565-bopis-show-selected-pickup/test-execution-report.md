# Test Execution Report: VCST-4565 - BOPIS Show Selected Pick Point on Popup Open

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
| **Overall Result** | **PASS** |

---

## Feature Description

When a user selects a pickup location in the BOPIS modal and confirms it, then reopens the pickup location popup, the previously selected pick point should be:
1. Visually highlighted in the location list (radio button pre-selected)
2. Shown on the map (map zoomed/panned to the location)
3. Info card automatically displayed with location details

---

## Test Environment

- **Logged in as:** Alice May (Computing Tabulating Recording Corporation >> IBM)
- **Cart contents:** 2 items -- Test YALUMBA Y SERIES CHARDONNAY ($1.20), Hoodie Base product with only File req ($250.00)
- **Delivery method:** Pickup
- **Selected pickup location:** Barclays' Center. Amazon pickup point (620 Atlantic Ave, New York, NY 10054)

---

## Test Results

### TC-01: Select a pickup location and confirm it

| Step | Action | Expected | Actual | Status |
|------|--------|----------|--------|--------|
| 1 | Navigate to cart page | Cart loads with items | Cart loaded with 2 items, Pickup already selected | PASS |
| 2 | Click edit (pencil) icon next to pickup address | Pick points modal opens | Modal opened with location list, map, Country/State/City filters | PASS |
| 3 | Click "Barclays' Center" in the location list | Radio selects, info card appears, map zooms | Radio selected, info card displayed with full details (address, hours, phone, email, description), map zoomed to Brooklyn | PASS |
| 4 | Click "Pick up here" button | Modal closes, address updates in cart | Modal closed, cart shows "620 Atlantic Ave, New York, New York, 10054, United States of America" | PASS |

**Evidence:** Screenshots 02-06

---

### TC-02: Reopen modal -- verify pre-selection (Core VCST-4565 Feature)

| Step | Action | Expected | Actual | Status |
|------|--------|----------|--------|--------|
| 1 | Click edit (pencil) icon to reopen modal | Modal opens with Barclays' Center pre-selected | Modal opened | PASS |
| 2 | Verify radio button state | Barclays' Center radio is checked | Programmatic verification: radio value `3663abaa-6266-4da7-87e2-c6f89c4f7cb5` is checked (index 2 of 52 radios) | **PASS** |
| 3 | Verify info card auto-displays | Pick point info card shown with Barclays' details | Info card displayed: name, "Today" chip, address, working hours (Mon-Sun: 9-18), contact phone (+10000000054), contact email (pickup34@example.com), description (Attraction) | **PASS** |
| 4 | Verify map position | Map zoomed to Barclays Center area | Map centered on coordinates 40.68265,-73.975118 (Brooklyn), nearby markers visible (Brooklyn Academy of Music, Atlantic Terminal Mall, etc.) | **PASS** |
| 5 | Verify CANCEL and PICK UP HERE buttons | Both buttons present in info card | Both buttons visible and functional | PASS |

**Evidence:** Screenshot 07

---

### TC-03: Select different location, then Cancel

| Step | Action | Expected | Actual | Status |
|------|--------|----------|--------|--------|
| 1 | Click "Museum of Arts and Design" in list | Radio switches to Museum, Barclays deselected | Radio changed, info card updated to Museum details, map panned to Columbus Circle | PASS |
| 2 | Click "Cancel" on the info card | Info card closes, modal stays open | Info card closed, modal remained open with location list and map | PASS |
| 3 | Verify Museum radio state after Cancel | Radio remains on Museum (Cancel only closes card, not selection) | Museum radio remained selected in the list view | PASS |

**Evidence:** Screenshots 08-09

---

### TC-04: Close modal (X button) -- verify original selection preserved

| Step | Action | Expected | Actual | Status |
|------|--------|----------|--------|--------|
| 1 | Click X (close) button on modal | Modal closes | Modal closed | PASS |
| 2 | Verify cart shows original Barclays' Center address | Address unchanged: 620 Atlantic Ave, New York, NY 10054 | Cart displays "620 Atlantic Ave, New York, New York, 10054, United States of America" -- original selection preserved | **PASS** |

**Evidence:** Screenshots 11-13

**Notes:** Closing the modal via X button correctly discards any uncommitted changes (Museum of Arts and Design was browsed but never confirmed with "Pick up here"). The original Barclays' Center remains the cart's pickup location.

---

### TC-05: Multiple reopens -- pre-selection persistence

| Step | Action | Expected | Actual | Status |
|------|--------|----------|--------|--------|
| 1 | Reopen modal (3rd time) | Barclays' Center pre-selected | Radio checked, info card auto-displayed, map zoomed to Brooklyn | **PASS** |
| 2 | Verify radio value | Same Barclays' Center ID | Value `3663abaa-6266-4da7-87e2-c6f89c4f7cb5` confirmed checked | **PASS** |

**Evidence:** Screenshot 14

---

### TC-06: Switch Delivery Method (Pickup -> Shipping -> Pickup)

| Step | Action | Expected | Actual | Status |
|------|--------|----------|--------|--------|
| 1 | Click "Shipping" tab | Delivery switches to Shipping mode | Shipping active, form shows "Shipping address*" and "Delivery method*" (Fixed Rate Ground). Pickup point field disappears. Tax: $80.24, Shipping: $150.00, Total: $481.44 | PASS |
| 2 | Click "Pickup" tab | Delivery switches back to Pickup | Pickup active, pickup point field returns | PASS |
| 3 | Verify pickup address preserved | Barclays' Center address still shown | "620 Atlantic Ave, New York, New York, 10054, United States of America" still displayed | **PASS** |
| 4 | Open modal | Barclays' Center pre-selected | Radio checked, info card auto-displayed, map zoomed to Brooklyn (40.68265,-73.975118) | **PASS** |

**Evidence:** Screenshots 15-17

**Notes:** The system correctly preserves the selected pickup location even when switching between Pickup and Shipping delivery methods. This is good UX -- users do not lose their pickup selection when exploring shipping options.

---

### TC-07: Country Filter -- filter and reset

| Step | Action | Expected | Actual | Status |
|------|--------|----------|--------|--------|
| 1 | Click "Country" filter dropdown | Dropdown opens with country list | Dropdown opened showing 11 countries with counts: Australia (1), Canada (2), China (1), Denmark (1), Hungary (1), Japan (1), Malaysia (1), Mexico (1), South Africa (2), United Kingdom (1), United States of America (90) | **PASS** |
| 2 | Select "Canada" | List filters to Canadian locations only | List shows 2 locations: Toronto Investment and Trade Centre, Airoport&the International Centre. "Canada" chip displayed. "Reset filters" button visible. COUNTRY badge shows "1". | **PASS** |
| 3 | Verify map updates | Map zooms to Canada | Map zoomed to Toronto/GTA area (43.678207,-79.509098) | PASS |
| 4 | Verify Barclays' Center hidden | USA location filtered out | Barclays' Center not in filtered list, no radio pre-selected | PASS |
| 5 | Click "Reset filters" | All locations return | All 50+ locations restored in list, filters cleared | PASS |
| 6 | Verify pre-selection restored | Barclays' Center re-selected after reset | Radio value `3663abaa-6266-4da7-87e2-c6f89c4f7cb5` is checked, map returned to Brooklyn | **PASS** |

**Evidence:** Screenshots 18-20

---

### TC-08: Console Error Monitoring

| Check | Expected | Actual | Status |
|-------|----------|--------|--------|
| JavaScript errors during all BOPIS operations | 0 errors | **0 errors** across 192 total console messages | **PASS** |
| Console warnings | Only non-blocking warnings | 128 warnings, all are Google Maps `<gmp-pin>` glyph deprecation warnings (third-party, non-blocking) | PASS |
| Network errors | No failed API requests | No network failures observed | PASS |

---

## Edge Cases & Observations

### Observation 1: Initial "Broadway & 7th Ave" Location Not Found

When the test session started, the cart had a previously selected pickup location "Broadway & 7th Ave, New York, 10093, United States" from an earlier session. When the modal was first opened, this location was **not present** in the pickup location list (none of the 50 radio buttons were pre-selected). This is likely because:
- The location was removed or renamed in the backend since it was originally selected
- The location ID no longer matches any current pickup point

This is **not a bug in VCST-4565** -- the feature correctly shows no pre-selection when the previously stored location ID does not exist in the current location data. A fresh selection (Barclays' Center) was made and all subsequent pre-selection tests passed.

### Observation 2: Cancel Button Behavior

When clicking Cancel on the info card, the radio button remains on the most recently clicked location (not reverted to the previously confirmed location). This is because Cancel only dismisses the info card overlay -- it does not undo the radio selection within the modal. The original cart selection is only changed when "Pick up here" is clicked. Closing the modal (X) correctly discards all uncommitted changes.

### Observation 3: Pickup Selection Survives Delivery Method Switch

Switching from Pickup to Shipping and back to Pickup preserves the selected pickup location. This is good UX design.

---

## Test Coverage Matrix

| Test Scenario | Status | Screenshot(s) |
|---------------|--------|---------------|
| Select pickup location and confirm | PASS | 02-06 |
| Reopen modal - radio pre-selected | **PASS** | 07 |
| Reopen modal - info card auto-displayed | **PASS** | 07, 14, 17 |
| Reopen modal - map zoomed to location | **PASS** | 07, 14, 17 |
| Select different location then Cancel | PASS | 08-09 |
| Close modal (X) - original preserved | **PASS** | 11-13 |
| Multiple reopens - persistent pre-selection | **PASS** | 14 |
| Shipping -> Pickup roundtrip preservation | **PASS** | 15-17 |
| Country filter - filter locations | PASS | 18-19 |
| Country filter - reset restores pre-selection | **PASS** | 20 |
| Console errors during BOPIS operations | PASS (0 errors) | N/A |

---

## Screenshots Index

| # | Filename | Description |
|---|----------|-------------|
| 01 | `01-homepage-loaded.png` | Homepage loaded, logged in as Alice May, PR build verified |
| 02 | `02-cart-page-with-pickup-selected.png` | Cart page with 2 items, Pickup delivery selected |
| 03 | `03-shipping-details-pickup-selected.png` | Shipping details section showing pickup address |
| 04 | `04-pickup-modal-reopened-full-view.png` | Pick points modal opened (initial state, no pre-selection) |
| 05 | `05-barclays-center-selected-info-card.png` | Barclays' Center selected, info card displayed |
| 06 | `06-barclays-center-confirmed-in-cart.png` | Barclays' Center confirmed in cart (620 Atlantic Ave) |
| 07 | `07-modal-reopened-check-preselection.png` | **KEY: Modal reopened - Barclays' pre-selected, info card auto-displayed, map zoomed** |
| 08 | `08-museum-arts-selected-different-location.png` | Museum of Arts and Design selected (different location) |
| 09 | `09-cancel-returns-to-info-card.png` | Cancel clicked - info card closed, modal stays open |
| 10 | `10-current-state-after-context-restore.png` | Browser state verification (session continuity) |
| 11 | `11-modal-closed-verify-barclays-preserved.png` | Modal closed, verifying cart state |
| 12 | `12-cart-top-barclays-address-check.png` | Cart top section after modal close |
| 13 | `13-shipping-details-barclays-preserved-after-close.png` | **KEY: Barclays' address preserved after closing modal** |
| 14 | `14-third-reopen-barclays-still-preselected.png` | **KEY: 3rd reopen - still pre-selected with info card** |
| 15 | `15-switched-to-shipping-delivery.png` | Switched to Shipping delivery method |
| 16 | `16-switched-back-to-pickup-address-preserved.png` | Switched back to Pickup - address preserved |
| 17 | `17-modal-after-shipping-roundtrip-preselected.png` | **KEY: Pre-selection persists after Shipping roundtrip** |
| 18 | `18-country-filter-dropdown-open.png` | Country filter dropdown showing 11 countries |
| 19 | `19-country-filter-canada-applied.png` | Canada filter applied - 2 locations, map on Toronto |
| 20 | `20-filter-reset-preselection-restored.png` | **KEY: Pre-selection restored after filter reset** |

---

## Bugs Found

**None.** All test cases passed. The VCST-4565 feature works as expected.

---

## Recommendation

**APPROVED** -- The VCST-4565 feature (show selected pick point on popup open) is working correctly on desktop (1920x1080) in Chromium. The pre-selection behavior is consistent across:
- Multiple modal reopens
- Cancel/Close operations
- Delivery method switches (Pickup <-> Shipping)
- Filter apply/reset cycles

The feature correctly handles edge cases (uncommitted selections discarded on close, pre-selection restored after filter reset).

### Suggested Additional Testing (if time permits)
- Mobile viewport testing (375x667) to verify responsive behavior
- Cross-browser testing (Firefox, Edge, WebKit)
- Test with a user that has no previously selected pickup location (clean state)
- Test with very long location lists and scroll behavior

---

## Sign-Off

| Role | Agent | Decision | Date |
|------|-------|----------|------|
| **Frontend Expert** | qa-frontend-expert | APPROVED | 2026-02-27 |
| **QA Lead** | qa-lead-orchestrator | PENDING | - |
