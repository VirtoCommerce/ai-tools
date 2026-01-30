# Test Cases for VCST-4077: [Facets] Show qty of facets applied

## User Story Details
- **Jira Key**: VCST-4077
- **Summary**: [Facets] Show qty of facets applied
- **Priority**: Medium
- **Status**: To do
- **Created**: 10/8/2025

## Description
As a user I want to see on each facet how many items I've selected so I can easily understand what filters applied.

---

## Test Cases

### Test Case 1: Single Facet Selection Badge Display
**Objective**: Verify that the badge displays correctly when a single facet value is selected

**Preconditions**:
- User is on the faceted search page
- Facets are available for selection

**Test Steps**:
1. Locate any facet widget
2. Select one value from the facet
3. Observe the widget header
4. Observe the horizontal facet display

**Expected Results**:
- Badge appears in widget header showing "1"
- Same badge appears in horizontal facets view
- Badge is clearly visible and properly styled

**Priority**: High

---

### Test Case 2: Multiple Facet Values Selection
**Objective**: Verify badge behavior when multiple values within the same facet are selected

**Preconditions**:
- User is on the faceted search page
- Facet with multiple selectable values is available

**Test Steps**:
1. Select first value from a facet
2. Select second value from the same facet
3. Select third value from the same facet
4. Observe badge updates

**Expected Results**:
- Badge updates incrementally with each selection (1→2→3)
- Badge displays total number of selected values accurately
- Badge updates appear in both widget header and horizontal view

**Priority**: High

---

### Test Case 3: Zero Selected Values Display
**Objective**: Verify badge behavior when no facet values are selected

**Preconditions**:
- User is on the faceted search page
- No facet values are currently selected

**Test Steps**:
1. Observe facet widget headers
2. Observe horizontal facets
3. Select one value then deselect it

**Expected Results**:
- No badges should be visible when no values are selected
- Badge appears when value is selected
- Badge disappears when last value is deselected

**Priority**: Medium

---

### Test Case 4: Maximum Values Selection
**Objective**: Test badge display with maximum allowed facet selections

**Preconditions**:
- User is on the faceted search page
- Facet with maximum selection limit is available

**Test Steps**:
1. Select maximum allowed values for a facet
2. Attempt to select one more value
3. Observe badge display

**Expected Results**:
- Badge correctly displays maximum number of selections
- Badge remains accurate when maximum limit is reached
- Badge styling handles double-digit numbers correctly

**Priority**: Medium

---

### Test Case 5: Cross-Browser Badge Display
**Objective**: Verify badge appearance across different browsers

**Preconditions**:
- Access to multiple browsers (Chrome, Firefox, Safari, Edge)
- Test environment is accessible

**Test Steps**:
1. Open application in each browser
2. Select multiple facet values
3. Compare badge display across browsers

**Expected Results**:
- Badge appears consistently across all browsers
- Badge styling is consistent
- Numbers are clearly visible in all browsers

**Priority**: Medium

---

### Test Case 6: Badge Persistence After Page Refresh
**Objective**: Verify badges persist after page refresh

**Test Steps**:
1. Select multiple facet values
2. Refresh the page
3. Observe badge status

**Expected Results**:
- Selected facets remain selected after refresh
- Badges display correct counts after refresh
- No visual glitches in badge display

**Priority**: Medium

---

## Edge Cases and Negative Tests

### Test Case 7: Special Characters in Facet Values
**Objective**: Verify badge behavior with special characters

**Preconditions**:
- Facets containing special characters are available

**Test Steps**:
1. Select facet values containing special characters
2. Observe badge display
3. Deselect values

**Expected Results**:
- Badge displays correct count regardless of value content
- No display issues or errors occur

**Priority**: Low

---

### Test Case 8: Rapid Selection/Deselection
**Objective**: Verify badge updates with rapid user interactions

**Test Steps**:
1. Quickly select multiple facet values
2. Quickly deselect multiple values
3. Alternate between select/deselect rapidly

**Expected Results**:
- Badge updates correctly keep pace with selections
- No lag or incorrect counts displayed
- UI remains stable during rapid interactions

**Priority**: Low

---

## Notes
- All badge displays should be consistent with design specifications
- Badge positioning should not interfere with other UI elements
- Consider accessibility testing for badge visibility
- Performance impact of badge updates should be minimal

Dependencies:
- UI component library support for badges
- Existing facet selection functionality
- State management for selected facets