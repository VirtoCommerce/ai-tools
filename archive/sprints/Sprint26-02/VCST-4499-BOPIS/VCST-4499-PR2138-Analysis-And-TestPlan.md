# VCST-4499 & PR #2138 Analysis and Test Plan

**Date:** 2026-01-29
**Ticket:** VCST-4499 - [BOPIS] The map jumps when searching or clearing
**Pull Request:** [#2138](https://github.com/VirtoCommerce/vc-frontend/pull/2138)
**Author:** Maya Diachkovskaia (@goldenmaya)
**Test URL:** https://virtostart-demo-store.govirto.com/cart

---

## 1. Executive Summary

PR #2138 implements a redesign of the BOPIS (Buy Online, Pick up In Store) address selection map modal to resolve VCST-4499, where the map would jump and change size during search operations. The implementation includes architectural improvements with 32 files changed, introducing new components and composables with enhanced state management and UI/UX improvements.

**Risk Level:** Medium - Core BOPIS functionality affected with significant architectural changes

---

## 2. Technical Analysis

### 2.1 Root Cause (VCST-4499)
The original bug manifested when users searched for or cleared pickup locations in the map modal. The map container would resize dynamically, causing a "jumping" effect that degraded user experience.

### 2.2 Solution Overview

#### Architecture Changes
```
New Structure:
├── Components
│   ├── PickupLocationCard (NEW) - Dedicated confirmation dialog
│   ├── select-address-map-modal (MODIFIED) - Core modal logic
│   ├── select-address-map-desktop (MODIFIED) - Desktop layout
│   ├── select-address-map-mobile (MODIFIED) - Mobile layout
│   └── google-map-marker (MODIFIED) - Enhanced marker control
├── Composables
│   ├── useSelectAddressMap (REFACTORED) - State & behavior management
│   └── useGoogleMaps (MODIFIED) - Map API interactions
└── UI Components
    ├── VcModal (MODIFIED) - Explicit scroll controls
    └── VcDialogContent (MODIFIED) - Container slot enhancements
```

#### Key Technical Improvements

**1. Scroll Behavior Management**
- Explicit scrolling controls in `VcModal` and `VcDialogContent`
- Container slot paths for better scroll target control
- Prevention of layout shifts during search/filter operations

**2. Google Maps Integration**
- Smooth pan/zoom animations with `onceIdle` callback
- Race condition prevention in info window operations
- Programmatic marker control via `openInfoWindow`

**3. State Management**
- Refactored `useSelectAddressMap` composable with improved lifecycle
- Better separation of concerns between desktop/mobile views
- Enhanced geolocation validation for invalid addresses

**4. UX Enhancements**
- New `PickupLocationCard` component for clearer selection flow
- Mobile list↔map toggle functionality
- Chip-based presentation in `PickupAvailabilityInfo`
- Improved loading states in shipping details

### 2.3 Quality Metrics
- **SonarQube:** ✅ Quality gate passed (0 new issues, 0 security hotspots)
- **Code Coverage:** 0.0% on new code (no unit tests added)
- **Code Review:** 1 approval, 3 pending reviews
- **Lines Changed:** +1,151 / -555 (net +596)
- **Commits:** 26

### 2.4 Risk Assessment

**Medium Risk Factors:**
1. **Scope:** 32 files modified across core BOPIS flow
2. **Map Timing:** Changes to Google Maps zoom/pan behavior could affect rendering
3. **Responsive Design:** Modal scrolling modified across multiple breakpoints
4. **No Unit Tests:** New code has 0% coverage
5. **Race Conditions:** Info window timing fixes need validation

**Mitigation:**
- Comprehensive manual testing required (see Section 3)
- Cross-browser and cross-device validation essential
- Performance testing recommended for map interactions

---

## 3. Functional Test Plan

### 3.1 Test Environment Setup

**Prerequisites:**
- [ ] Deploy PR #2138 build to test environment
- [ ] Test URL: https://virtostart-demo-store.govirto.com/cart
- [ ] Shopping cart must contain at least 2 products
- [ ] Multiple pickup locations configured in the system
- [ ] Google Maps API key properly configured

**Test Devices:**
- Desktop: Chrome, Firefox, Edge, Safari (latest versions)
- Mobile: iOS Safari, Android Chrome
- Screen sizes: 320px, 768px, 1024px, 1920px

**Test Data Requirements:**
- Valid physical addresses for search
- Pickup locations within and outside delivery radius
- Locations with various availability statuses

---

### 3.2 Core Test Scenarios

#### **TC-001: Basic Map Stability (Primary Bug Fix)**
**Objective:** Verify map does not jump or resize during search operations

**Priority:** P0 - Critical
**Related Issue:** VCST-4499

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Add products to cart | Cart contains items | ☐ |
| 2 | Navigate to cart page | Cart page displays | ☐ |
| 3 | Scroll to shipping section | Shipping options visible | ☐ |
| 4 | Select "Pickup" option | Pickup location selector opens | ☐ |
| 5 | Click "Select pickup location" | Map modal opens with map displayed | ☐ |
| 6 | **Measure map container dimensions** | Note height/width | ☐ |
| 7 | Enter location name in search field | Search field accepts input | ☐ |
| 8 | **Verify map dimensions** | Map size remains unchanged | ☐ |
| 9 | **Verify map position** | Map does not jump/shift | ☐ |
| 10 | Clear search field using X button | Search field clears | ☐ |
| 11 | **Verify map dimensions** | Map size remains unchanged | ☐ |
| 12 | **Verify map position** | Map does not jump/shift | ☐ |
| 13 | Enter address in search field | Results appear | ☐ |
| 14 | Clear search field manually (backspace) | Field clears | ☐ |
| 15 | **Verify map dimensions** | Map size remains unchanged | ☐ |
| 16 | Repeat steps 7-15 three times | Consistent behavior each time | ☐ |

**Pass Criteria:**
- Map container maintains consistent dimensions throughout all operations
- No visual "jumping" or layout shifts
- Smooth transitions between states

---

#### **TC-002: Desktop View - Location Selection Flow**
**Objective:** Validate complete desktop pickup location selection workflow

**Priority:** P0 - Critical
**Device:** Desktop (1920x1080)

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Open pickup location modal | Modal opens with map on right, list on left | ☐ |
| 2 | **Verify layout** | Desktop layout displays (not mobile) | ☐ |
| 3 | Click on a location in the list | Location highlights on map | ☐ |
| 4 | **Verify map behavior** | Map pans smoothly to selected location | ☐ |
| 5 | **Verify info window** | Info window opens on marker | ☐ |
| 6 | Click different location in list | Previous highlight clears, new location highlights | ☐ |
| 7 | **Verify smooth pan** | Map animates smoothly to new location | ☐ |
| 8 | Click marker on map directly | Info window opens | ☐ |
| 9 | Click "Select" in info window | `PickupLocationCard` dialog opens | ☐ |
| 10 | **Verify card content** | Location details, availability, contact info display | ☐ |
| 11 | Click "Confirm" | Modal closes, pickup location set | ☐ |
| 12 | **Verify cart page** | Selected location displays in cart | ☐ |

**Pass Criteria:**
- All interactions smooth without lag
- Map animations complete before next interaction
- No race conditions in info window display
- Location card shows all required information

---

#### **TC-003: Mobile View - List/Map Toggle**
**Objective:** Validate mobile-specific toggle functionality

**Priority:** P0 - Critical
**Device:** Mobile (375x667) - iOS Safari, Android Chrome

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Open pickup location modal on mobile | Modal opens showing list view by default | ☐ |
| 2 | **Verify toggle button** | List/Map toggle visible at top | ☐ |
| 3 | Click "Map" toggle | View switches to map | ☐ |
| 4 | **Verify map display** | Map fills viewport correctly | ☐ |
| 5 | **Verify list hidden** | List view not visible | ☐ |
| 6 | Click "List" toggle | View switches back to list | ☐ |
| 7 | **Verify list display** | List fills viewport correctly | ☐ |
| 8 | **Verify map hidden** | Map view not visible | ☐ |
| 9 | Switch to Map view | Map displays | ☐ |
| 10 | Click on a marker | Info window opens on marker | ☐ |
| 11 | Click "Select" in info window | `PickupLocationCard` opens | ☐ |
| 12 | **Verify card on mobile** | Card displays properly on small screen | ☐ |
| 13 | Confirm selection | Modal closes, location set | ☐ |

**Pass Criteria:**
- Toggle switches views instantly without lag
- Each view properly sized for mobile viewport
- No horizontal scrolling
- Touch targets appropriately sized (min 44x44px)

---

#### **TC-004: Search Functionality**
**Objective:** Validate search behavior and results

**Priority:** P1 - High

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Open pickup location modal | Modal opens | ☐ |
| 2 | Enter partial location name (e.g., "Mall") | Results filter to matching locations | ☐ |
| 3 | **Verify map updates** | Only matching location markers visible | ☐ |
| 4 | **Verify list updates** | Only matching locations in list | ☐ |
| 5 | Clear search using X button | All locations return | ☐ |
| 6 | Enter full address | Map zooms to address area | ☐ |
| 7 | **Verify nearby locations** | Locations near address highlighted | ☐ |
| 8 | Enter invalid/non-existent address | Appropriate error/empty state shown | ☐ |
| 9 | **Verify geolocation handling** | No crash, graceful error handling | ☐ |
| 10 | Clear invalid search | Returns to normal state | ☐ |
| 11 | Type rapidly in search field | Search debounces appropriately | ☐ |
| 12 | **Verify no excessive API calls** | Reasonable number of map updates | ☐ |

**Pass Criteria:**
- Search results accurate and immediate
- Map and list stay synchronized
- Error states handled gracefully
- No performance issues with rapid typing

---

#### **TC-005: Filter Operations**
**Objective:** Validate location filtering functionality

**Priority:** P1 - High

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Open pickup location modal | Modal opens with filters visible | ☐ |
| 2 | **Verify filter UI** | Filter section properly styled and responsive | ☐ |
| 3 | Apply availability filter (if available) | List filters to available locations only | ☐ |
| 4 | **Verify map markers** | Unavailable locations greyed out or hidden | ☐ |
| 5 | Apply distance filter (if available) | Locations sorted/filtered by distance | ☐ |
| 6 | Combine multiple filters | Both filters apply correctly | ☐ |
| 7 | Search while filters active | Search respects active filters | ☐ |
| 8 | Clear filters | All locations return | ☐ |
| 9 | **Verify map reset** | Map shows all locations again | ☐ |

**Pass Criteria:**
- Filters apply correctly and immediately
- Map and list remain synchronized
- Multiple filters work together correctly

---

#### **TC-006: Map Interaction & Info Windows**
**Objective:** Validate Google Maps integration and info window behavior

**Priority:** P1 - High

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Open pickup location modal | Map loads completely | ☐ |
| 2 | **Verify map renders** | No blank map, markers visible | ☐ |
| 3 | Zoom in using controls | Map zooms smoothly | ☐ |
| 4 | Zoom out using controls | Map zooms smoothly | ☐ |
| 5 | Pan map by dragging | Map pans smoothly | ☐ |
| 6 | Click marker A | Info window A opens | ☐ |
| 7 | **Quickly click marker B** | Info window B opens, A closes | ☐ |
| 8 | **Verify no race condition** | Only one info window visible | ☐ |
| 9 | Rapidly click multiple markers | No crashes, single info window always | ☐ |
| 10 | Click map background | Current info window closes | ☐ |
| 11 | Use keyboard to navigate list | Map updates accordingly | ☐ |
| 12 | **Verify smooth pan animation** | Map animates smoothly with idle callback | ☐ |

**Pass Criteria:**
- Map interactions smooth and responsive
- No race conditions in info window display
- Only one info window visible at a time
- Animations complete properly before next interaction

---

#### **TC-007: Pickup Location Card Component**
**Objective:** Validate new PickupLocationCard confirmation dialog

**Priority:** P1 - High

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Open pickup location modal | Modal opens | ☐ |
| 2 | Select a location | `PickupLocationCard` dialog opens | ☐ |
| 3 | **Verify card structure** | Title, details, availability, actions visible | ☐ |
| 4 | **Verify location details** | Name, address, hours display correctly | ☐ |
| 5 | **Verify availability info** | Chip-based availability presentation | ☐ |
| 6 | **Verify contact information** | Phone, email (if any) display correctly | ☐ |
| 7 | **Verify action buttons** | "Confirm" and "Cancel" buttons present | ☐ |
| 8 | Click "Cancel" | Dialog closes, returns to map modal | ☐ |
| 9 | **Verify modal state preserved** | Map position and selection unchanged | ☐ |
| 10 | Select location again | Card reopens | ☐ |
| 11 | Click "Confirm" | Card closes, modal closes, location set | ☐ |
| 12 | **Verify cart update** | Selected location shows in cart | ☐ |

**Pass Criteria:**
- Card displays all relevant location information
- Actions work correctly
- State management proper on cancel/confirm
- UI matches design specifications

---

#### **TC-008: Scroll Behavior & Modal Controls**
**Objective:** Validate enhanced scroll controls in modal

**Priority:** P2 - Medium

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Open pickup location modal | Modal opens | ☐ |
| 2 | **Verify modal structure** | Header, content, footer (if any) visible | ☐ |
| 3 | Scroll location list | List scrolls independently of map | ☐ |
| 4 | **Verify map static** | Map does not scroll with list | ☐ |
| 5 | Scroll to bottom of list | Scroll stops at end | ☐ |
| 6 | Scroll to top of list | Scroll stops at top | ☐ |
| 7 | Open location card | Card opens over modal | ☐ |
| 8 | **Verify modal scroll disabled** | Background modal does not scroll | ☐ |
| 9 | Close card | Modal scroll re-enabled | ☐ |
| 10 | Open/close modal 5 times rapidly | No scroll-related issues | ☐ |

**Pass Criteria:**
- Scroll containers work independently
- No unexpected scroll behavior
- Scroll properly disabled/enabled with dialogs

---

#### **TC-009: Responsive Breakpoint Testing**
**Objective:** Validate layout across all breakpoints

**Priority:** P1 - High

| Breakpoint | Width | Expected Layout | Status |
|------------|-------|-----------------|--------|
| Mobile Small | 320px | List/Map toggle, single column | ☐ |
| Mobile | 375px | List/Map toggle, single column | ☐ |
| Mobile Large | 425px | List/Map toggle, single column | ☐ |
| Tablet | 768px | Desktop layout or enhanced mobile? | ☐ |
| Desktop Small | 1024px | Desktop layout: list left, map right | ☐ |
| Desktop | 1440px | Desktop layout: list left, map right | ☐ |
| Desktop Large | 1920px | Desktop layout: list left, map right | ☐ |

**For Each Breakpoint:**
1. Open modal
2. Verify layout matches design
3. Test search functionality
4. Test location selection
5. Verify no horizontal scroll
6. Verify no layout breaks
7. Test all interactive elements

**Pass Criteria:**
- Layouts appropriate for each breakpoint
- No broken layouts or overlapping elements
- All functionality works at all sizes

---

#### **TC-010: Localization Testing**
**Objective:** Validate translations across all supported languages

**Priority:** P2 - Medium

**Languages to Test:** de, en, es, fi, fr, it, ja, no, pl, pt, ru, sv, zh

| Language | UI Translated | Text Fits | No Overflow | Status |
|----------|---------------|-----------|-------------|--------|
| English (en) | ☐ | ☐ | ☐ | ☐ |
| German (de) | ☐ | ☐ | ☐ | ☐ |
| Spanish (es) | ☐ | ☐ | ☐ | ☐ |
| Finnish (fi) | ☐ | ☐ | ☐ | ☐ |
| French (fr) | ☐ | ☐ | ☐ | ☐ |
| Italian (it) | ☐ | ☐ | ☐ | ☐ |
| Japanese (ja) | ☐ | ☐ | ☐ | ☐ |
| Norwegian (no) | ☐ | ☐ | ☐ | ☐ |
| Polish (pl) | ☐ | ☐ | ☐ | ☐ |
| Portuguese (pt) | ☐ | ☐ | ☐ | ☐ |
| Russian (ru) | ☐ | ☐ | ☐ | ☐ |
| Swedish (sv) | ☐ | ☐ | ☐ | ☐ |
| Chinese (zh) | ☐ | ☐ | ☐ | ☐ |

**Pass Criteria:**
- All UI elements properly translated
- No truncated text
- Buttons and labels fit in containers
- RTL languages (if applicable) display correctly

---

#### **TC-011: Performance Testing**
**Objective:** Validate performance with various location counts

**Priority:** P2 - Medium

| Scenario | Location Count | Expected Behavior | Status |
|----------|----------------|-------------------|--------|
| Few Locations | 1-5 | Instant load and interaction | ☐ |
| Normal Locations | 10-50 | Fast load (<1s), smooth interaction | ☐ |
| Many Locations | 50-100 | Acceptable load (<2s), smooth interaction | ☐ |
| Many Markers | 100+ | Map clustering or pagination | ☐ |

**Tests:**
1. Modal open time
2. Search response time
3. Filter response time
4. Map pan/zoom smoothness
5. Memory usage (no leaks)
6. Network requests (reasonable count)

**Pass Criteria:**
- Modal opens within 1 second for normal counts
- Smooth 60fps interactions
- No memory leaks
- Reasonable API call count

---

#### **TC-012: Error Handling & Edge Cases**
**Objective:** Validate error scenarios and edge cases

**Priority:** P2 - Medium

| Scenario | Action | Expected Result | Status |
|----------|--------|-----------------|--------|
| No Locations | Open modal with empty locations | Appropriate empty state | ☐ |
| Map Load Failure | Block Google Maps API | Graceful fallback or error | ☐ |
| Geolocation Denied | Deny browser geolocation | App continues without geolocation | ☐ |
| Invalid Coordinates | Location with invalid lat/lng | Error handled, doesn't crash | ☐ |
| Network Interruption | Disconnect during search | Appropriate error message | ☐ |
| Slow Connection | Throttle network to 3G | Loading states display | ☐ |
| Very Long Location Name | 200+ character name | Text truncated or wrapped | ☐ |
| Special Characters | Location with emojis/symbols | Displays correctly | ☐ |
| Concurrent Users | Multiple users select same location | No conflicts | ☐ |

**Pass Criteria:**
- No crashes in any error scenario
- Clear error messages
- Graceful degradation
- User can recover from errors

---

#### **TC-013: Browser Compatibility**
**Objective:** Validate cross-browser functionality

**Priority:** P1 - High

| Browser | Version | Desktop | Mobile | Status |
|---------|---------|---------|--------|--------|
| Chrome | Latest | ☐ | ☐ | ☐ |
| Firefox | Latest | ☐ | N/A | ☐ |
| Safari | Latest | ☐ | ☐ | ☐ |
| Edge | Latest | ☐ | N/A | ☐ |

**Test All Core Scenarios (TC-001 through TC-007) in Each Browser**

**Pass Criteria:**
- All functionality works in all browsers
- No browser-specific bugs
- Consistent appearance across browsers

---

#### **TC-014: Accessibility Testing**
**Objective:** Validate WCAG 2.1 AA compliance

**Priority:** P2 - Medium

| Test | Requirement | Status |
|------|-------------|--------|
| Keyboard Navigation | Tab through all interactive elements | ☐ |
| Focus Indicators | Visible focus on all focusable elements | ☐ |
| Screen Reader | Announces modal, locations, actions | ☐ |
| ARIA Labels | Proper ARIA labels on buttons/controls | ☐ |
| Color Contrast | Meets WCAG AA contrast ratios | ☐ |
| Skip Links | Can skip to main content | ☐ |
| Form Labels | All form fields properly labeled | ☐ |
| Error Announcements | Errors announced to screen readers | ☐ |

**Tools:**
- axe DevTools
- NVDA / JAWS (screen readers)
- Keyboard only navigation

**Pass Criteria:**
- No critical accessibility violations
- Keyboard accessible
- Screen reader compatible

---

#### **TC-015: Integration Testing**
**Objective:** Validate integration with cart and checkout flow

**Priority:** P1 - High

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Add products to cart | Cart updated | ☐ |
| 2 | Select pickup location | Location set | ☐ |
| 3 | **Verify cart displays location** | Selected location visible | ☐ |
| 4 | Change pickup location | New location selected | ☐ |
| 5 | **Verify cart updates** | New location displays | ☐ |
| 6 | Proceed to checkout | Checkout loads with pickup info | ☐ |
| 7 | **Verify checkout has location** | Pickup location in checkout | ☐ |
| 8 | Complete order | Order includes pickup location | ☐ |
| 9 | **Verify order confirmation** | Confirmation shows pickup details | ☐ |
| 10 | Switch to delivery | Pickup location cleared | ☐ |
| 11 | Switch back to pickup | Can select location again | ☐ |

**Pass Criteria:**
- Pickup location persists through cart/checkout
- Data correctly passed between components
- No data loss on page refresh (if session preserved)

---

### 3.3 Regression Testing

#### Areas to Validate (Not Changed by PR but Could Be Affected)

| Area | Tests | Priority | Status |
|------|-------|----------|--------|
| Standard Delivery | Shipping address selection works | P1 | ☐ |
| Cart Operations | Add/remove items, update quantities | P1 | ☐ |
| Other Modals | Other dialogs/modals still function | P2 | ☐ |
| Checkout Flow | Complete checkout with delivery | P1 | ☐ |
| Payment | Payment processing unaffected | P1 | ☐ |
| Order History | Previous pickup orders display correctly | P2 | ☐ |

---

### 3.4 Test Execution Summary

#### Test Metrics

| Metric | Target | Actual |
|--------|--------|--------|
| Test Cases Executed | 15 | ___ |
| Test Cases Passed | 15 | ___ |
| Test Cases Failed | 0 | ___ |
| Defects Found | 0 | ___ |
| Critical Defects | 0 | ___ |
| Code Coverage (manual) | 80%+ | ___% |

#### Test Environment

| Component | Version | Status |
|-----------|---------|--------|
| PR Build | #2138 | ☐ |
| Base URL | virtostart-demo-store.govirto.com | ☐ |
| Google Maps API | Configured | ☐ |
| Test Data | Loaded | ☐ |

---

## 4. Defect Reporting Template

When defects are found, use this format:

```
**Defect ID:** VCST-XXXX
**Severity:** Critical / High / Medium / Low
**Priority:** P0 / P1 / P2 / P3
**Test Case:** TC-XXX
**Component:** Component name
**Browser:** Browser + version
**Device:** Desktop / Mobile (model)

**Steps to Reproduce:**
1. Step one
2. Step two
3. Step three

**Expected Result:**
What should happen

**Actual Result:**
What actually happens

**Screenshots/Video:**
[Attach evidence]

**Additional Notes:**
Any other relevant information
```

---

## 5. Sign-Off Criteria

The following must be met before approving PR #2138:

### Mandatory (Must Pass)
- [ ] TC-001: Map stability verified (primary bug fix)
- [ ] TC-002: Desktop selection flow works
- [ ] TC-003: Mobile toggle functionality works
- [ ] TC-004: Search functionality works
- [ ] TC-006: Map interactions smooth, no race conditions
- [ ] TC-007: Pickup location card works correctly
- [ ] TC-013: Works in Chrome, Firefox, Safari, Edge
- [ ] TC-015: Integration with cart/checkout works
- [ ] Zero critical defects
- [ ] Zero high-severity defects blocking core functionality

### Recommended (Should Pass)
- [ ] TC-005: Filter operations work
- [ ] TC-008: Scroll behavior correct
- [ ] TC-009: All responsive breakpoints work
- [ ] TC-012: Error handling graceful
- [ ] TC-014: Basic accessibility requirements met
- [ ] Medium/low defects documented and triaged

### Optional (Nice to Have)
- [ ] TC-010: All languages tested
- [ ] TC-011: Performance benchmarks met
- [ ] TC-014: Full WCAG AA compliance
- [ ] Automated tests added for critical paths

---

## 6. Test Execution Log

**Tester Name:** QA Automation (Playwright)
**Test Date:** 2026-01-29
**Build Version:** 2.41.0-pr-2138-b3bd-b3bd5de4
**Test Duration:** 1.5 hours

### Daily Test Summary

| Date | Tests Run | Passed | Failed | Blocked | Notes |
|------|-----------|--------|--------|---------|-------|
| 2026-01-29 | 2 | 1 | 1 | 0 | TC-001 (Map Stability) FAILED - Critical CSS layout bug found. TC-004 (Search Functionality) PASSED but affected by map layout issue. |
|      |           |        |        |         |       |
|      |           |        |        |         |       |

### Defects Found

| ID | Severity | Test Case | Status | Notes |
|----|----------|-----------|--------|-------|
| [VCST-4518](https://virtocommerce.atlassian.net/browse/VCST-4518) | High | TC-001, TC-004 | Reported | Pickup location map becomes too narrow (~30% width) after search operations. Reproduced 100% with both empty results ("Westent foxpost") and valid results ("South Schuylershire"). Map returns to normal (~50% width) after reset. Root cause: CSS layout issue - list/empty state takes excessive width, map has insufficient min-width constraint. Evidence: 5 screenshots in [Reports/](../../Reports/) directory. Jira Comment ID: 87266. Detailed report: [JIRA-Bug-Report-Pickup-Map-Too-Narrow.md](../../Reports/JIRA-Bug-Report-Pickup-Map-Too-Narrow.md) |
|    |          |           |        |       |
|    |          |           |        |       |

### Test Results Detail

#### TC-001: Basic Map Stability (Primary Bug Fix) - **FAILED**

**Test Date:** 2026-01-29
**Result:** ❌ FAILED - Critical bug found
**Bug ID:** [VCST-4518](https://virtocommerce.atlassian.net/browse/VCST-4518)

**Execution Summary:**

| Step | Action | Expected Result | Actual Result | Status |
|------|--------|-----------------|---------------|--------|
| 1-2 | Open pickup modal, check initial map size | Map occupies ~50% of modal width | ✅ Map size acceptable (~50% width) | PASS |
| 3 | Search "Westent foxpost" (empty result) | Map maintains reasonable width (~40-50%) | ❌ **BUG:** Map becomes too narrow (~30% width); "Pickup points not found" message takes most space | FAIL |
| 4 | Click "Reset search" | Map returns to normal size | ✅ Map returns to ~50% width | PASS |
| 5 | Search "South Schuylershire" (1 result) | Map maintains reasonable width (~40-50%) | ❌ **BUG:** Map becomes too narrow (~30% width) even with valid result | FAIL |
| 6 | Click location in list | Info card opens with readable layout | ❌ **BUG:** Info card overlays narrow map; layout constrained | FAIL |

**Visual Evidence:**
- [BUG-Pickup-Map-Initial-Normal-Size.png](../../Reports/BUG-Pickup-Map-Initial-Normal-Size.png) - Initial state (map OK, ~50% width)
- [BUG-Pickup-Map-After-Search-Narrow.png](../../Reports/BUG-Pickup-Map-After-Search-Narrow.png) - After search "Westent foxpost" (BUG: map narrow ~30%)
- [BUG-Pickup-Map-After-Reset-Normal.png](../../Reports/BUG-Pickup-Map-After-Reset-Normal.png) - After reset (map restored to ~50%)
- [BUG-Pickup-Map-South-Schuylershire-Narrow.png](../../Reports/BUG-Pickup-Map-South-Schuylershire-Narrow.png) - After search "South Schuylershire" (BUG: map narrow with results)
- [BUG-Pickup-Map-South-Schuylershire-With-Info-Card.png](../../Reports/BUG-Pickup-Map-South-Schuylershire-With-Info-Card.png) - Info card opened (BUG: layout constrained)

**Root Cause:**
CSS layout issue in pickup points modal. The list/empty state column takes excessive width, while the map column has no min-width constraint. After search operations, the layout recalculation fails to maintain proper space distribution (should be 40-50% for map, actually becomes ~30% or less).

**Recommended Fix:**
Apply CSS constraints to maintain map visibility:
```css
/* Container holding list + map */
.vc-pickup-points__content {
  display: grid;
  grid-template-columns: minmax(280px, 400px) 1fr; /* list capped, map takes rest */
  gap: 1rem;
  min-height: 500px;
}

/* Map column: ensure minimum width */
.vc-pickup-points-map-wrapper {
  min-width: 500px;
  min-height: 400px;
}
```

---

#### TC-004: Search Functionality - **PASSED** (with Critical Bug Impact)

**Test Date:** 2026-01-29
**Result:** ✅ PASSED (search functionality works correctly, but impacted by TC-001 bug)

**Execution Summary:**

| Step | Action | Expected Result | Actual Result | Status |
|------|--------|-----------------|---------------|--------|
| 1 | Search with valid term "South Schuylershire" | Returns 1 matching location | ✅ Returns 1 result: South Schuylershire, MEX | PASS |
| 2 | Search with invalid term "Westent foxpost" | Shows "Pickup points not found" message | ✅ Shows "Pickup points not found" | PASS |
| 3 | Verify search filters list | Only matching locations displayed | ✅ List filtered correctly | PASS |
| 4 | Click "Reset search" | Full list restored | ✅ All locations restored | PASS |
| 5 | Verify map markers sync with search | Map shows only filtered locations | ✅ Map markers synchronized with search results | PASS |

**Note:** Search functionality operates correctly, but the map layout bug (TC-001) severely impacts usability. Users cannot effectively view filtered locations on the map due to the narrow map width (~30% instead of expected 40-50%).

**Impact:** High - While search works, the core value proposition (visual map-based selection) is compromised by the layout bug.

---

## 7. Recommendations

### Before Merge
1. **Add Unit Tests:** Current coverage is 0% for new code
2. **Performance Monitoring:** Add telemetry for modal open/interaction times
3. **Error Tracking:** Implement error logging for map failures
4. **Documentation:** Update user documentation for new UX flow

### Post-Merge
1. **Monitor Production:** Watch for map-related errors in production logs
2. **User Feedback:** Collect feedback on new UX
3. **A/B Testing:** Consider A/B test if traffic allows
4. **Performance Metrics:** Track Core Web Vitals impact

### Future Improvements
1. **Automated Testing:** Add Playwright/Cypress tests for critical paths
2. **Visual Regression:** Implement visual regression testing
3. **Load Testing:** Test with high concurrent user counts
4. **Map Alternatives:** Consider fallback if Google Maps unavailable

---

## 8. Approval

| Role | Name | Signature | Date |
|------|------|-----------|------|
| QA Lead | | | |
| Product Owner | | | |
| Tech Lead | | | |

---

**Document Version:** 1.0
**Last Updated:** 2026-01-29
**Next Review:** After test execution
