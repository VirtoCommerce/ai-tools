# Test Plan: VCST-4578 - BOPIS Search Clear Button Fix

## Overview

**JIRA Ticket:** [VCST-4578](https://virtocommerce.atlassian.net/browse/VCST-4578)
**Feature:** BOPIS Pickup Location Search
**Bug Description:** Search clear (X) button does not restore pickup location results
**Assignee:** Maya Diachkovskaia
**Test Environment:** QA Frontend (https://vcst-qa-storefront.govirto.com/)
**Version:** Ver. 2.41.0-pr-2138-d99f-d99fc444
**Priority:** P2 (User experience issue, workaround exists)

## Test Objectives

1. Verify X (clear) button properly clears search text
2. Verify X (clear) button restores full pickup location list
3. Verify map markers are restored when search is cleared
4. Verify behavior is consistent across browsers (Chrome, WebKit, Firefox)
5. Verify behavior is consistent across viewports (Desktop, Mobile)
6. Verify no regression in other BOPIS search functionality

## Scope

### In Scope
- Pickup Location modal search functionality
- X (clear) button behavior
- Location list restoration
- Map marker restoration
- Cross-browser testing (Chrome, WebKit, Firefox)
- Cross-viewport testing (Desktop 1920x1080, Mobile 375x667)

### Out of Scope
- Pickup location data accuracy
- Map rendering performance
- Backend pickup location APIs
- Other BOPIS features (location selection, filters)

## Test Strategy

### 1. Core Functionality Testing (P0)
- X button clears search text
- X button restores full location list
- Map markers restored after clearing search

### 2. Edge Cases (P1)
- Clear search with zero results
- Clear search with partial results
- Multiple search/clear cycles
- Clear button state when field is empty

### 3. UX Validation (P1)
- X button visibility and clickability
- Visual feedback on clear action
- Consistency with "Reset search" button behavior

### 4. Cross-Browser Testing (P1)
- Chrome (primary)
- WebKit (Safari equivalent)
- Firefox

### 5. Cross-Viewport Testing (P1)
- Desktop (1920x1080)
- Mobile (375x667 - iPhone SE equivalent)

### 6. Regression Testing (P2)
- Other pickup location search features
- Pickup location selection flow
- Cart pickup option

## Test Environment

**Frontend URL:** https://vcst-qa-storefront.govirto.com/
**Credentials:** Use standard QA test user (USER_EMAIL, USER_PASSWORD from .env)
**Prerequisites:**
- Store has configured pickup locations
- Products are available for pickup
- User has items in cart

## Test Cases

### TC-01: Clear Search Restores All Locations (Primary Bug Fix)
**Priority:** P0
**Steps:**
1. Navigate to https://vcst-qa-storefront.govirto.com/
2. Sign in with test user credentials
3. Add product to cart
4. Navigate to Cart page
5. Select "Pickup" delivery option
6. Click "Select pickup location" button
7. Verify pickup location modal opens with full list
8. Count initial locations displayed
9. Enter search term in search field (e.g., "Mall")
10. Verify filtered results appear (fewer locations)
11. Click X (clear) button in search field
12. Verify search field is cleared (empty)
13. Verify full location list is restored
14. Verify count matches initial count from step 8
15. Verify map shows all location markers

**Expected Result:**
- Search field is empty
- All pickup locations are visible in list
- Map shows all location markers
- Location count matches original count

**Actual Result:** [To be filled during execution]

---

### TC-02: Clear Button Visibility and State
**Priority:** P1
**Steps:**
1. Open pickup location modal
2. Verify X (clear) button is NOT visible when field is empty
3. Type one character in search field
4. Verify X (clear) button appears
5. Click X button
6. Verify X button disappears after clearing

**Expected Result:**
- X button only visible when search field has text
- X button disappears after clearing

---

### TC-03: Clear Search with Zero Results
**Priority:** P1
**Steps:**
1. Open pickup location modal
2. Enter search term that returns zero results (e.g., "ZZZZZ")
3. Verify "Reset search" message appears
4. Click X (clear) button
5. Verify all locations restored

**Expected Result:**
- All locations restored
- "Reset search" message disappears
- Map shows all markers

---

### TC-04: Multiple Search/Clear Cycles
**Priority:** P1
**Steps:**
1. Open pickup location modal
2. Perform search (e.g., "Mall")
3. Click X to clear
4. Verify locations restored
5. Perform different search (e.g., "Center")
6. Click X to clear
7. Verify locations restored
8. Repeat 2 more cycles

**Expected Result:**
- Each clear operation restores full list
- No degradation over multiple cycles
- No console errors

---

### TC-05: X Button vs Reset Search Button Consistency
**Priority:** P1
**Steps:**
1. Open pickup location modal
2. Enter search term with zero results
3. Verify "Reset search" button appears
4. Click "Reset search"
5. Verify all locations restored
6. Enter same search term again
7. Click X (clear) button
8. Verify behavior matches "Reset search" button

**Expected Result:**
- X button and "Reset search" button produce identical results
- Both restore full location list with map markers

---

### TC-06: Mobile Viewport (375x667)
**Priority:** P1
**Steps:**
1. Set viewport to 375x667 (iPhone SE)
2. Navigate to cart and open pickup modal
3. Enter search term
4. Click X (clear) button
5. Verify locations restored in mobile view
6. Verify map markers restored
7. Verify UI elements properly sized

**Expected Result:**
- Clear button works on mobile
- Location list scrollable and fully visible
- Map markers restored

---

### TC-07: WebKit Browser (Safari)
**Priority:** P1
**Steps:**
1. Open in WebKit browser
2. Repeat TC-01 steps
3. Verify no browser-specific issues

**Expected Result:**
- Same behavior as Chrome
- No WebKit-specific bugs

---

### TC-08: Firefox Browser
**Priority:** P1
**Steps:**
1. Open in Firefox browser
2. Repeat TC-01 steps
3. Verify no browser-specific issues

**Expected Result:**
- Same behavior as Chrome
- No Firefox-specific bugs

---

### TC-09: Regression - Search Functionality
**Priority:** P2
**Steps:**
1. Open pickup location modal
2. Test search with valid terms (multiple terms)
3. Verify filtering works correctly
4. Test search with partial matches
5. Verify map updates with filtered results

**Expected Result:**
- Search filtering works as before
- No regression in search functionality

---

### TC-10: Regression - Location Selection
**Priority:** P2
**Steps:**
1. Open pickup location modal
2. Search for location
3. Clear search with X button
4. Select a pickup location from restored list
5. Verify location is set in cart
6. Continue with checkout

**Expected Result:**
- Location selection works after clearing search
- No errors in checkout flow

## Success Criteria

### Must Pass (Blocker)
- TC-01: Clear button restores all locations
- TC-03: Clear button works with zero results
- TC-06: Mobile viewport functionality

### Should Pass (Release with caution)
- TC-02: Clear button visibility
- TC-04: Multiple clear cycles
- TC-05: Consistency with Reset button
- TC-07: WebKit compatibility
- TC-08: Firefox compatibility

### Nice to Have
- TC-09: Search regression
- TC-10: Selection regression

## Risks and Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Pickup locations not configured on QA | Blocker | Verify environment before testing |
| Browser-specific behavior differences | Medium | Test all browsers early |
| Map library issues | Medium | Monitor console for errors |
| State management issues after multiple clears | Medium | Test cycle scenarios (TC-04) |

## Testing Timeline

**Estimated Duration:** 2-3 hours

| Activity | Duration | Owner |
|----------|----------|-------|
| Environment setup & validation | 15 min | qa-frontend-expert |
| Core functionality testing (TC-01 to TC-05) | 45 min | qa-frontend-expert |
| Cross-viewport testing (TC-06) | 20 min | qa-frontend-expert |
| Cross-browser testing (TC-07, TC-08) | 30 min | qa-frontend-expert |
| Regression testing (TC-09, TC-10) | 30 min | qa-frontend-expert |
| Bug documentation and reporting | 20 min | qa-lead-orchestrator |

## Deliverables

1. Test execution report with pass/fail status for all test cases
2. Screenshots/videos demonstrating:
   - Before clear (search active, filtered results)
   - After clear (search empty, all locations restored)
   - Map state before and after clear
3. Console logs (check for errors)
4. HAR file for network activity analysis
5. Bug report if issues found (with STR, evidence)
6. JIRA ticket update with test results

## Test Data Requirements

- Active pickup locations in QA environment (minimum 5 locations)
- Products available for pickup
- Test user with valid credentials
- Search terms that produce:
  - Partial results (e.g., "Mall", "Center")
  - Zero results (e.g., "ZZZZZ")
  - Single result

## Exit Criteria

- All P0 test cases pass
- No critical or high-severity bugs found
- X (clear) button behavior matches "Reset search" button
- Cross-browser and cross-viewport testing complete
- Test execution report delivered
- JIRA ticket updated with results and evidence

## Approval

**Approved By:** qa-lead-orchestrator
**Date:** 2026-02-04
**Next Steps:** Execute test cases and report findings
