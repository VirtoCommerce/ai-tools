# Test Cases for VCST-2285: [UI kit] Rework search component

## User Story Details
- **Jira Key**: VCST-2285
- **Summary**: [UI kit] Rework search component
- **Priority**: Medium
- **Status**: REFINEMENT
- **Created**: 11/19/2024

## Description
Add option to clear the search input

---

## Test Cases

### Test Case 1: Verify Clear Button Appears When Text is Entered
**Objective**: Validate that the clear button/icon is displayed in the search component when user enters text

**Preconditions**:
- User is logged into Virto Commerce Platform Manager (https://docs.virtocommerce.org/platform/user-guide/getting-started/)
- User has access to any module with search functionality (e.g., Catalog, Orders, Customers)
- Search component is visible on the page

**Test Steps**:
1. Navigate to any page with a search component (e.g., Catalog > Products)
2. Locate the search input field
3. Verify the search field is empty and no clear button is visible
4. Type any text into the search input field (e.g., "test product")
5. Observe the search component UI

**Expected Results**:
- Clear button/icon (typically an 'X' or close icon) appears within or adjacent to the search input field
- Clear button is visible and visually distinguishable
- Clear button appears immediately after first character is entered
- Search functionality remains operational

**Test Data**: 
- Text input: "test product", "123", "special@chars"

**Priority**: High

---

### Test Case 2: Verify Clear Button Functionality Removes Search Text
**Objective**: Validate that clicking the clear button removes all text from the search input field

**Preconditions**:
- User is logged into Virto Commerce Platform Manager
- User has navigated to a page with search functionality (https://docs.virtocommerce.org/platform/user-guide/)
- Search input field is accessible

**Test Steps**:
1. Navigate to any module with search component (e.g., Marketing > Promotions)
2. Enter text into the search input field (e.g., "discount promotion")
3. Verify the clear button is displayed
4. Click on the clear button
5. Observe the search input field state

**Expected Results**:
- All text is removed from the search input field immediately
- Search input field returns to empty state
- Clear button disappears after clearing the text
- Search results (if any were displayed) are reset to show all items or default view
- Focus remains on the search input field for user convenience

**Test Data**: 
- Single word: "product"
- Multiple words: "winter sale promotion"
- Special characters: "item@#$%"
- Numbers: "12345"

**Priority**: High

---

### Test Case 3: Verify Clear Button Keyboard Accessibility
**Objective**: Ensure the clear button is accessible via keyboard navigation and can be activated using keyboard

**Preconditions**:
- User is logged into Virto Commerce Platform Manager
- User has access to search functionality
- Keyboard navigation is enabled

**Test Steps**:
1. Navigate to a page with search component using Tab key navigation
2. Enter text into the search field (e.g., "test query")
3. Press Tab key to move focus to the clear button
4. Verify the clear button receives focus (visual focus indicator should be visible)
5. Press Enter or Space key while clear button has focus
6. Observe the result

**Expected Results**:
- Clear button is reachable via Tab key navigation
- Clear button shows visible focus indicator when focused
- Pressing Enter or Space key triggers the clear action
- Search text is removed completely
- Keyboard navigation follows accessibility standards (WCAG 2.1)
- User can continue typing immediately after clearing

**Test Data**: 
- Text input: "accessibility test"

**Priority**: High

---

### Test Case 4: Verify Clear Button Behavior with Search Results
**Objective**: Validate that clearing search text properly resets filtered/searched results

**Preconditions**:
- User is logged into Virto Commerce Platform Manager
- User has navigated to a module with searchable data (e.g., Catalog with existing products - https://docs.virtocommerce.org/modules/catalog/)
- Multiple items exist in the system to demonstrate filtering

**Test Steps**:
1. Navigate to Catalog > Products page
2. Note the total number of products displayed initially
3. Enter a specific search term that filters results (e.g., "electronics")
4. Wait for search results to update and display filtered items
5. Note the reduced number of items shown
6. Click the clear button in the search field
7. Observe the results list and search field state

**Expected Results**:
- Search field is cleared completely
- Product list returns to the original unfiltered state
- Total count of items matches the initial count before search
- No search filters remain applied
- Loading indicators (if any) display during result refresh
- UI returns to default state smoothly without errors

**Test Data**: 
- Search terms: "electronics", "clothing", "accessories"
- Test on lists with 0, 1-10, and 50+ items

**Priority**: High

---

### Test Case 5: Verify Clear Button Does Not Appear in Empty Search Field
**Objective**: Validate that the clear button is not displayed when the search field is empty or only contains whitespace

**Preconditions**:
- User is logged into Virto Commerce Platform Manager
- Search component is visible and accessible

**Test Steps**:
1. Navigate to any page with search functionality (e.g., Orders module - https://docs.virtocommerce.org/modules/order/)
2. Verify the search input field is empty
3. Observe the search component - confirm no clear button is visible
4. Enter spaces only (single space, multiple spaces, tabs)
5. Observe if clear button appears
6. Clear the spaces and verify search field is empty again
7. Enter text and then delete it character by character using Backspace
8. Observe when clear button disappears

**Expected Results**:
- Clear button is NOT visible when search field is empty
- Clear button does NOT appear for whitespace-only input (debatable - document actual behavior)
- Clear button disappears when last character is deleted via Backspace
- No visual glitches or flickering when toggling button visibility
- Search field maintains consistent layout whether clear button is visible or hidden

**Test Data**: 
- Empty field
- Single space: " "
- Multiple spaces: "     "
- Tab character

**Priority**: Medium

---

## Edge Cases and Negative Tests

### Edge Cases Covered:
- **Long text strings**: Test with very long search queries (500+ characters) to ensure clear button remains functional and visible
- **Rapid typing and clearing**: Quickly type and click clear multiple times to test for race conditions
- **Browser compatibility**: Test clear button appearance and functionality across different browsers (Chrome, Firefox, Safari, Edge)
- **Mobile/responsive view**: Verify clear button is appropriately sized and positioned on mobile devices
- **Concurrent search operations**: Test clearing while search/filter operation is in progress

---

## Notes
- The clear button should follow Virto Commerce UI kit design standards and be consistent across all search components
- Consider testing integration with existing keyboard shortcuts (if any exist for search functionality)
- Verify that analytics/tracking events (if implemented) properly capture clear button usage
- Test should be repeated across different modules (Catalog, Orders, Customers, Marketing, etc.) to ensure consistent behavior
- Consider localization: clear button tooltip/aria-label should be properly localized if applicable
- Related documentation: https://docs.virtocommerce.org/platform/user-guide/ and https://docs.virtocommerce.org/modules/