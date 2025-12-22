# Test Plan: VCST-4357 - [E2E] [Multi-organizations] Search the org in the list

## Test Information
| Field | Value |
|-------|-------|
| **Ticket** | [VCST-4357](https://virtocommerce.atlassian.net/browse/VCST-4357) |
| **Title** | [E2E] [Multi-organizations] Search the org in the list |
| **Type** | Story |
| **Priority** | High |
| **Assignee** | Anatolii.Vasilev |
| **QA Engineer** | Elena Mutykova |
| **Story Points** | 3 |
| **QA Estimation** | 6 hours |
| **Sprint** | VCST Sprint 25-26-Christmas ❄️ |
| **Design Link** | [Figma](https://www.figma.com/design/9DBmmQwGVbYiayQa4JOVC5/%F0%9F%94%B6--STOREFRONT-DRAFT-%E2%80%A2-2?node-id=8386-206920) |

---

## Story Summary
As a Sales Rep I want to be able to search org in the drop-down.

### Acceptance Criteria
1. Show native search bar on top of list if there are more than (>) 10 organizations
2. Filter the list based on my keyword

---

## Test Scope

### In Scope
- Organization search functionality in dropdown
- Search bar visibility based on organization count threshold (>10)
- Filtering behavior with various keywords
- Cross-browser testing (Chrome, Edge, WebKit, Firefox)
- Mobile responsive testing (iPhone 16/17/18, Android Galaxy S25)

### Out of Scope
- Organization CRUD operations
- User authentication flows (precondition only)

---

## Test Environment
- **Frontend URL:** VCST_FRONT_URL (from environment)
- **Test User:** Sales Rep user with access to multiple organizations (>10)
- **Browsers:** Chrome, Edge, WebKit, Firefox (last 2 versions)
- **Mobile Devices:** iPhone 16/17/18, Android Galaxy S25

---

## Preconditions
1. User is authenticated as a Sales Rep
2. User has access to multiple organizations (test with both ≤10 and >10 organizations)
3. Frontend application is running and accessible

---

## Test Cases

### TC-001: Search Bar Visibility - More Than 10 Organizations

**Title:** Verify search bar appears when user has more than 10 organizations

**Priority:** Critical

**Preconditions:**
- User is logged in as Sales Rep
- User belongs to more than 10 organizations

**Steps:**
1. Navigate to the organization selector/dropdown
2. Click to expand the organization list
3. Observe the dropdown content

**Expected Result:**
- Search bar is visible at the top of the organization list
- Search bar has a native input field appearance
- Search bar is positioned above the organization list items

---

### TC-002: Search Bar Visibility - 10 or Fewer Organizations

**Title:** Verify search bar is hidden when user has 10 or fewer organizations

**Priority:** Critical

**Preconditions:**
- User is logged in as Sales Rep
- User belongs to exactly 10 or fewer organizations

**Steps:**
1. Navigate to the organization selector/dropdown
2. Click to expand the organization list
3. Observe the dropdown content

**Expected Result:**
- Search bar is NOT visible
- Organization list is displayed without a search field
- All organizations are visible in the list

---

### TC-003: Search Bar Visibility - Exactly 10 Organizations (Boundary)

**Title:** Verify search bar is hidden when user has exactly 10 organizations

**Priority:** High

**Preconditions:**
- User is logged in as Sales Rep
- User belongs to exactly 10 organizations

**Steps:**
1. Navigate to the organization selector/dropdown
2. Click to expand the organization list
3. Count the organizations in the list
4. Observe if search bar is present

**Expected Result:**
- Search bar is NOT visible (threshold is >10, not ≥10)
- All 10 organizations are displayed in the list

---

### TC-004: Search Bar Visibility - Exactly 11 Organizations (Boundary)

**Title:** Verify search bar appears when user has exactly 11 organizations

**Priority:** High

**Preconditions:**
- User is logged in as Sales Rep
- User belongs to exactly 11 organizations

**Steps:**
1. Navigate to the organization selector/dropdown
2. Click to expand the organization list
3. Count the organizations in the list
4. Observe if search bar is present

**Expected Result:**
- Search bar IS visible (threshold is >10)
- Search bar is positioned at the top of the list
- All 11 organizations are initially displayed

---

### TC-005: Basic Search Functionality - Full Name Match

**Title:** Verify filtering works with full organization name

**Priority:** Critical

**Preconditions:**
- User has access to more than 10 organizations
- Search bar is visible
- Known organization name exists (e.g., "Acme Corporation")

**Steps:**
1. Open the organization dropdown
2. Enter the full organization name in the search field
3. Observe the filtered results

**Expected Result:**
- List is filtered to show only matching organization(s)
- The matching organization is highlighted or visible
- Non-matching organizations are hidden from the list

---

### TC-006: Search Functionality - Partial Name Match

**Title:** Verify filtering works with partial organization name

**Priority:** Critical

**Preconditions:**
- User has access to more than 10 organizations
- Search bar is visible

**Steps:**
1. Open the organization dropdown
2. Enter a partial organization name (e.g., "Acme")
3. Observe the filtered results

**Expected Result:**
- List shows all organizations containing the partial keyword
- Results include organizations where the keyword appears at beginning, middle, or end
- Filtering is case-insensitive

---

### TC-007: Search Functionality - Case Insensitivity

**Title:** Verify search is case-insensitive

**Priority:** High

**Preconditions:**
- User has access to more than 10 organizations
- Search bar is visible
- Known organization name exists (e.g., "ACME Corporation")

**Steps:**
1. Open the organization dropdown
2. Search with lowercase: "acme"
3. Note the results
4. Clear search
5. Search with uppercase: "ACME"
6. Note the results
7. Clear search
8. Search with mixed case: "AcMe"
9. Note the results

**Expected Result:**
- All three searches return the same results
- Search is case-insensitive for all variations

---

### TC-008: Search Functionality - No Results Found

**Title:** Verify behavior when no organizations match search criteria

**Priority:** High

**Preconditions:**
- User has access to more than 10 organizations
- Search bar is visible

**Steps:**
1. Open the organization dropdown
2. Enter a search term that doesn't match any organization (e.g., "xyz123nonexistent")
3. Observe the dropdown behavior

**Expected Result:**
- List shows empty state or "No results found" message
- UI handles empty state gracefully
- User can clear search and see full list again

---

### TC-009: Search Functionality - Clear Search

**Title:** Verify clearing search restores full organization list

**Priority:** High

**Preconditions:**
- User has access to more than 10 organizations
- Search has been performed and list is filtered

**Steps:**
1. Open the organization dropdown
2. Enter a search term to filter the list
3. Verify list is filtered
4. Clear the search field (delete text or click clear button if available)
5. Observe the list

**Expected Result:**
- Full organization list is restored
- All organizations are visible again
- Search field is empty

---

### TC-010: Search Functionality - Special Characters

**Title:** Verify search handles special characters properly

**Priority:** Medium

**Preconditions:**
- User has access to more than 10 organizations
- Search bar is visible

**Steps:**
1. Open the organization dropdown
2. Enter special characters: `!@#$%^&*()`
3. Observe behavior
4. Clear search
5. Enter HTML/script tags: `<script>alert('test')</script>`
6. Observe behavior

**Expected Result:**
- No JavaScript errors in console
- Application handles special characters gracefully
- No XSS vulnerability
- Either shows "no results" or filters appropriately

---

### TC-011: Search Functionality - Leading/Trailing Spaces

**Title:** Verify search handles whitespace correctly

**Priority:** Medium

**Preconditions:**
- User has access to more than 10 organizations
- Search bar is visible
- Known organization name exists (e.g., "Acme")

**Steps:**
1. Open the organization dropdown
2. Enter search with leading spaces: "   Acme"
3. Note the results
4. Clear search
5. Enter search with trailing spaces: "Acme   "
6. Note the results

**Expected Result:**
- Search works correctly with leading/trailing whitespace
- Whitespace is trimmed and correct results are displayed

---

### TC-012: Search Functionality - Real-time Filtering

**Title:** Verify search filters in real-time as user types

**Priority:** High

**Preconditions:**
- User has access to more than 10 organizations
- Search bar is visible

**Steps:**
1. Open the organization dropdown
2. Type a character slowly and observe list after each keystroke
3. Continue typing and observe list updates

**Expected Result:**
- List filters dynamically as each character is typed
- No need to press Enter or click a button
- Filtering happens immediately (within ~100-300ms)
- No visible lag or delay in filtering

---

### TC-013: Search Functionality - Organization Selection After Search

**Title:** Verify user can select an organization from filtered results

**Priority:** Critical

**Preconditions:**
- User has access to more than 10 organizations
- Search bar is visible

**Steps:**
1. Open the organization dropdown
2. Enter a search term to filter the list
3. Click on one of the filtered organizations
4. Observe the selection

**Expected Result:**
- Organization is successfully selected
- Dropdown closes after selection
- Selected organization is now active/displayed
- Search field is cleared or ready for next use

---

### TC-014: Search Functionality - Keyboard Navigation

**Title:** Verify keyboard navigation works with search

**Priority:** Medium

**Preconditions:**
- User has access to more than 10 organizations
- Search bar is visible

**Steps:**
1. Open the organization dropdown
2. Enter a search term to filter the list
3. Use Arrow Down key to navigate results
4. Use Arrow Up key to navigate up
5. Press Enter to select highlighted item

**Expected Result:**
- Arrow keys navigate through filtered results
- Selected/highlighted item is visually indicated
- Enter key selects the highlighted organization
- Navigation wraps or stops at list boundaries

---

### TC-015: Search Input Placeholder and Styling

**Title:** Verify search input has proper placeholder and styling

**Priority:** Medium

**Preconditions:**
- User has access to more than 10 organizations

**Steps:**
1. Open the organization dropdown
2. Observe the search input field appearance
3. Check for placeholder text
4. Check for search icon (if applicable)

**Expected Result:**
- Search input has appropriate placeholder text (e.g., "Search organizations...")
- Search input styling matches the design system
- Search icon is present (if per design)
- Focus state is visually indicated

---

### TC-016: Search Persistence Across Dropdown Toggle

**Title:** Verify search is cleared when dropdown is closed and reopened

**Priority:** Low

**Preconditions:**
- User has access to more than 10 organizations
- Search bar is visible

**Steps:**
1. Open the organization dropdown
2. Enter a search term to filter the list
3. Close the dropdown (click outside)
4. Reopen the dropdown
5. Observe the search field state

**Expected Result:**
- Search field is cleared when dropdown reopens
- Full organization list is displayed
- User starts fresh with each dropdown open

---

### TC-017: Search with Unicode Characters

**Title:** Verify search works with unicode/international characters

**Priority:** Medium

**Preconditions:**
- User has access to organizations with unicode names (e.g., "Компания", "企業", "Société")
- Search bar is visible

**Steps:**
1. Open the organization dropdown
2. Search using unicode characters matching an organization name
3. Observe the results

**Expected Result:**
- Unicode search terms are handled correctly
- Matching organizations with unicode names are found
- No encoding errors or garbled text

---

### TC-018: Empty Search Field Behavior

**Title:** Verify empty search field shows all organizations

**Priority:** High

**Preconditions:**
- User has access to more than 10 organizations
- Search bar is visible

**Steps:**
1. Open the organization dropdown
2. Observe list with empty search field
3. Enter a character
4. Delete the character (backspace)
5. Observe the list

**Expected Result:**
- Empty search field displays all organizations
- List immediately returns to full state when search is empty
- No partial filter state remains

---

## Cross-Browser Test Matrix

| Test Case | Chrome | Edge | WebKit | Firefox |
|-----------|--------|------|--------|---------|
| TC-001: Search Bar Visibility (>10 orgs) | ☐ | ☐ | ☐ | ☐ |
| TC-002: Search Bar Hidden (≤10 orgs) | ☐ | ☐ | ☐ | ☐ |
| TC-005: Full Name Search | ☐ | ☐ | ☐ | ☐ |
| TC-006: Partial Name Search | ☐ | ☐ | ☐ | ☐ |
| TC-012: Real-time Filtering | ☐ | ☐ | ☐ | ☐ |
| TC-013: Organization Selection | ☐ | ☐ | ☐ | ☐ |

---

## Mobile Test Matrix

| Test Case | iPhone 16 | iPhone 17 | iPhone 18 | Galaxy S25 |
|-----------|-----------|-----------|-----------|------------|
| TC-001: Search Bar Visibility (>10 orgs) | ☐ | ☐ | ☐ | ☐ |
| TC-005: Full Name Search | ☐ | ☐ | ☐ | ☐ |
| TC-006: Partial Name Search | ☐ | ☐ | ☐ | ☐ |
| TC-012: Real-time Filtering | ☐ | ☐ | ☐ | ☐ |
| TC-013: Organization Selection (Touch) | ☐ | ☐ | ☐ | ☐ |
| Mobile keyboard interaction | ☐ | ☐ | ☐ | ☐ |
| Responsive dropdown layout | ☐ | ☐ | ☐ | ☐ |

---

## Mobile-Specific Test Cases

### TC-M01: Touch Keyboard Behavior

**Title:** Verify virtual keyboard interaction on mobile

**Priority:** High

**Preconditions:**
- Mobile device with touchscreen
- User has access to more than 10 organizations

**Steps:**
1. Open the organization dropdown
2. Tap on the search field
3. Observe virtual keyboard appearance
4. Type a search term
5. Observe filtering behavior
6. Select an organization from results

**Expected Result:**
- Virtual keyboard opens when search field is tapped
- Search field remains visible above keyboard
- Typing filters the list correctly
- Organization can be selected by tapping
- Keyboard dismisses after selection

---

### TC-M02: Responsive Dropdown Layout

**Title:** Verify dropdown adapts to mobile viewport

**Priority:** High

**Preconditions:**
- Mobile device or responsive viewport

**Steps:**
1. Navigate to organization selector on mobile
2. Open the dropdown
3. Observe layout and positioning
4. Verify scrollability if list is long

**Expected Result:**
- Dropdown is properly sized for mobile viewport
- Search bar is accessible and usable
- List is scrollable if needed
- No horizontal overflow or cut-off content

---

### TC-M03: Touch Scrolling in Filtered List

**Title:** Verify touch scrolling works in filtered organization list

**Priority:** Medium

**Preconditions:**
- Mobile device with touchscreen
- Filtered list still has multiple results

**Steps:**
1. Open organization dropdown on mobile
2. Enter a search term that returns multiple results
3. Attempt to scroll the filtered list by touch
4. Verify scroll behavior

**Expected Result:**
- List scrolls smoothly with touch gestures
- Search field remains fixed at top
- No accidental selections while scrolling

---

## Test Data Requirements

| Scenario | Organization Count | Example Names |
|----------|-------------------|---------------|
| Below threshold | ≤10 | Org1, Org2, ..., Org10 |
| At threshold | 11 | Org1 through Org11 |
| Above threshold | 15+ | Various organization names for search testing |
| With special chars | - | "O'Reilly & Sons", "Company #1", "Test (Dev)" |
| With unicode | - | "Компания", "企業株式会社", "Société Générale" |

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Search not filtering correctly | High | Thorough testing with various keywords |
| Threshold count incorrect | Medium | Boundary testing (10, 11 organizations) |
| Performance with large org lists | Medium | Test with 50+ organizations |
| Mobile keyboard covering content | High | Test on actual mobile devices |
| XSS vulnerability in search | High | Test special characters and HTML input |

---

## Success Criteria

1. ✅ Search bar appears only when user has >10 organizations
2. ✅ Search bar is hidden when user has ≤10 organizations
3. ✅ Search filters organizations in real-time
4. ✅ Partial and full name matching works correctly
5. ✅ Search is case-insensitive
6. ✅ Organization selection works after filtering
7. ✅ UI is consistent across all supported browsers
8. ✅ Mobile responsive design is functional
9. ✅ No console errors during testing
10. ✅ Network requests are efficient (no excessive API calls)

---

## Console/Network Monitoring Checklist

- [ ] Check for JavaScript errors during dropdown interaction
- [ ] Verify no excessive network requests during typing
- [ ] Monitor for failed API calls
- [ ] Check response times for organization list/search API
- [ ] Verify no console warnings about deprecated features

---

## Notes

- This feature is related to VCST-4395 (Extended Me and GetPageContext)
- Related E2E auto-tests ticket: VCST-4460
- Design reference available in Figma (link in story)

