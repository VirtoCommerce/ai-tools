# Pick Points Modal - Filter Search Test Cases

## Overview
Test cases for the search functionality within the Country, State/Province, and City filter dropdowns in the Pick points modal.

**Related Jira Ticket:** [VCST-4447](https://virtocommerce.atlassian.net/browse/VCST-4447)  
**Test Environment:** https://vcst-qa-storefront.govirto.com  
**Test Credentials:** ricreyacrouyi-3425@yopmail.com / Password1!

---

## Prerequisites
- User is logged in
- Cart contains at least one item
- Pickup delivery option is selected
- Pick points modal is open

---

## Test Suite: Country Filter Search

### TC-001: Basic Country Search - Single Character
**Priority:** High  
**Type:** Functional

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click on COUNTRY dropdown | Dropdown opens with search field and country list |
| 2 | Enter "A" in search field | List filters to show countries containing "A" (Australia, Canada, Japan, Malaysia, South Africa) |
| 3 | Verify filtered results | Only countries containing "A" are displayed |

---

### TC-002: Country Search - Multiple Characters
**Priority:** High  
**Type:** Functional

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click on COUNTRY dropdown | Dropdown opens |
| 2 | Enter "United" in search field | List filters to show "United Kingdom" and potentially "United States of America" |
| 3 | Verify exact matches appear first | Matching countries are displayed with count badges |

---

### TC-003: Country Search - Case Insensitivity
**Priority:** Medium  
**Type:** Functional

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click on COUNTRY dropdown | Dropdown opens |
| 2 | Enter "DENMARK" in uppercase | Denmark is displayed in results |
| 3 | Clear and enter "denmark" in lowercase | Denmark is displayed in results |
| 4 | Clear and enter "DeNmArK" in mixed case | Denmark is displayed in results |

---

### TC-004: Country Search - No Results
**Priority:** Medium  
**Type:** Negative

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click on COUNTRY dropdown | Dropdown opens |
| 2 | Enter "XYZ123" (non-existent country) | "No results" message is displayed |
| 3 | Verify the message styling | Message is clearly visible and user-friendly |

---

### TC-005: Country Search - Clear Search Text
**Priority:** High  
**Type:** Functional

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click on COUNTRY dropdown | Dropdown opens |
| 2 | Enter "K" in search field | List filters to Denmark, United Kingdom |
| 3 | Clear the search field (backspace/delete) | Full country list is restored |
| 4 | Verify all countries are visible | All available countries are displayed |

---

### TC-006: Country Search - Special Characters
**Priority:** Low  
**Type:** Edge Case

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click on COUNTRY dropdown | Dropdown opens |
| 2 | Enter special characters (!, @, #, $) | No crash, shows "No results" or handles gracefully |
| 3 | Enter spaces only | Handles gracefully (shows all or no results) |

---

## Test Suite: State/Province Filter Search

### TC-007: Basic State/Province Search
**Priority:** High  
**Type:** Functional

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click on STATE / PROVINCE dropdown | Dropdown opens with search field and state list |
| 2 | Enter "New" in search field | List filters to show states containing "New" (New York, New Jersey, etc.) |
| 3 | Verify filtered results | Only matching states are displayed with count badges |

---

### TC-008: State Search After Country Selection
**Priority:** High  
**Type:** Functional

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Select "United States of America" in Country filter | Country filter is applied |
| 2 | Click on STATE / PROVINCE dropdown | Only US states are shown |
| 3 | Enter "Cal" in search field | California is displayed |
| 4 | Verify filtered list | Only US states matching "Cal" are shown |

---

## Test Suite: City Filter Search

### TC-009: Basic City Search
**Priority:** High  
**Type:** Functional

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click on CITY dropdown | Dropdown opens with search field and city list |
| 2 | Enter "New" in search field | List filters to show cities containing "New" (New York, Newark, etc.) |
| 3 | Verify filtered results | Matching cities are displayed with count badges |

---

### TC-010: City Search - Partial Match
**Priority:** Medium  
**Type:** Functional

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click on CITY dropdown | Dropdown opens |
| 2 | Enter "York" in search field | New York is displayed in results |
| 3 | Verify partial matching works | Cities containing "York" anywhere in the name are shown |

---

## Test Suite: Cross-Filter Interactions

### TC-011: Search Text Retention After Switching Filters (BUG SCENARIO)
**Priority:** Critical  
**Type:** Regression - VCST-4447

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click on COUNTRY dropdown | Dropdown opens |
| 2 | Enter "K" in search field | List filters to Denmark, United Kingdom |
| 3 | Click on CITY dropdown | City dropdown opens |
| 4 | Select "New York" | City filter is applied, pickup points filter to New York locations |
| 5 | Click on COUNTRY dropdown again | **Expected:** Shows "United States of America" (the only applicable country) |
|   |  | **Bug Behavior:** Shows "No results" because "K" search text is retained |

**Expected Fix:** Country dropdown should either:
- Clear search text when another filter is applied
- Show results based on current filter state regardless of previous search text

---

### TC-012: Search Text Should Clear When Filter is Applied
**Priority:** High  
**Type:** Functional

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click on COUNTRY dropdown | Dropdown opens |
| 2 | Enter "Can" in search field | Canada is displayed |
| 3 | Select "Canada" checkbox | Canada filter is applied |
| 4 | Click on COUNTRY dropdown again | Search field should be empty, showing only selected/applicable countries |

---

### TC-013: Multiple Filter Combination with Search
**Priority:** High  
**Type:** Functional

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Select "United States of America" in Country | Country filter applied |
| 2 | Click on STATE / PROVINCE dropdown | Only US states shown |
| 3 | Enter "New" and select "New York" | State filter applied |
| 4 | Click on CITY dropdown | Only New York cities are shown |
| 5 | Enter "Brook" in city search | Brooklyn is displayed in results |
| 6 | Verify all filters work together | Pickup points list shows only Brooklyn, NY, USA locations |

---

### TC-014: Filter Reset Should Clear All Search Text
**Priority:** High  
**Type:** Functional

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Apply multiple filters with search text in each | Filters are applied |
| 2 | Click "Reset filters" button | All filters are cleared |
| 3 | Open each dropdown (Country, State, City) | Search fields are empty in all dropdowns |
| 4 | Full lists are displayed | All options are available without filtering |

---

### TC-015: Search Text Persistence Within Same Session
**Priority:** Medium  
**Type:** Functional

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click on COUNTRY dropdown | Dropdown opens |
| 2 | Enter "Aus" in search field | Australia is displayed |
| 3 | Close dropdown (click outside) | Dropdown closes |
| 4 | Open COUNTRY dropdown again | Search field state should be defined (either cleared or retained with clear UX) |

---

## Test Suite: Search Field UI/UX

### TC-016: Search Field Placeholder Text
**Priority:** Low  
**Type:** UI

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click on COUNTRY dropdown | "Search Country" placeholder is visible |
| 2 | Click on STATE / PROVINCE dropdown | "Search State" or similar placeholder is visible |
| 3 | Click on CITY dropdown | "Search City" placeholder is visible |

---

### TC-017: Search Field Focus State
**Priority:** Low  
**Type:** UI

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click on any filter dropdown | Dropdown opens |
| 2 | Observe search field | Search field should be auto-focused for immediate typing |
| 3 | Start typing | Characters appear in search field without clicking on it |

---

### TC-018: Search Results Count Display
**Priority:** Medium  
**Type:** UI

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click on COUNTRY dropdown | Countries shown with count badges (e.g., "Canada (2)") |
| 2 | Enter search term | Filtered results show accurate count badges |
| 3 | Verify counts reflect available pickup points | Numbers match the actual pickup points for each option |

---

## Test Suite: Performance

### TC-019: Search Response Time
**Priority:** Medium  
**Type:** Performance

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click on COUNTRY dropdown | Dropdown opens within 500ms |
| 2 | Type characters quickly | Search filters results in real-time without lag |
| 3 | Verify no UI freezing | Interface remains responsive during search |

---

### TC-020: Large Dataset Search
**Priority:** Medium  
**Type:** Performance

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open CITY dropdown (largest dataset) | All cities load without significant delay |
| 2 | Enter single character search | Filtering completes within 300ms |
| 3 | Scroll through results | Smooth scrolling without lag |

---

## Test Suite: Accessibility

### TC-021: Keyboard Navigation in Search
**Priority:** Medium  
**Type:** Accessibility

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Tab to COUNTRY dropdown and press Enter | Dropdown opens |
| 2 | Type search term | Text is entered in search field |
| 3 | Use Arrow keys to navigate results | Focus moves through filtered options |
| 4 | Press Enter to select | Option is selected |
| 5 | Press Escape | Dropdown closes |

---

### TC-022: Screen Reader Compatibility
**Priority:** Low  
**Type:** Accessibility

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to filter dropdown with screen reader | Dropdown role and name are announced |
| 2 | Enter search text | Search field and current value are announced |
| 3 | Navigate filtered results | Each option is announced with count |
| 4 | "No results" scenario | "No results" message is announced |

---

## Test Data

### Countries Available in Test Environment:
- Australia
- Canada
- China
- Denmark
- Hungary
- Japan
- Malaysia
- Mexico
- South Africa
- United Kingdom
- United States of America

### Sample Cities:
- New York (USA)
- Toronto (Canada)
- London (UK)
- Tokyo (Japan)
- Sydney (Australia)

---

## Test Execution Notes

### Environment Setup:
1. Clear browser cache before testing
2. Use incognito mode for clean session
3. Ensure stable network connection

### Known Issues:
- **VCST-4447:** Country filter search text is retained after applying other filters, causing "No results" display

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-12-29 | QA Agent | Initial test case creation |

