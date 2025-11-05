# Test Plan for VCST-4199: Search Cross Icon Bug

## Bug Summary
**Issue**: [Search] The press Enter from the keyboard to the cross icon redirects to the Search page, but does not clear the field.

**Ticket**: VCST-4199
**Type**: Bug
**Priority**: Medium
**Status**: Testing
**Assignee**: Maya Diachkovskaia
**Reporter**: Elena Mutykova

## Bug Description
### Steps to Reproduce:
1. Focus on the search bar field
2. Move the Tab to the Cross icon
3. Press Enter

### Expected Result:
The cross icon clears the field by pressing Enter on the keyboard.

### Actual Result:
The press Enter from the keyboard to the cross icon redirects to the Search page, but does not clear the field.

## Test Environment
- **Frontend Version**: [To be determined from website footer]
- **Browser**: Chrome (primary), Firefox, Safari (cross-browser testing)
- **Test Date**: November 5, 2025
- **Tester**: Elena Mutykova

## Test Cases

### TC-01: Verify Cross Icon Functionality with Mouse Click
**Objective**: Verify that clicking the cross icon with mouse works correctly
**Preconditions**: User is on a page with search functionality
**Steps**:
1. Navigate to the search page
2. Enter some text in the search field
3. Click the cross icon with mouse
**Expected Result**: Search field is cleared
**Priority**: High

### TC-02: Verify Cross Icon Functionality with Enter Key (Bug Reproduction)
**Objective**: Reproduce the reported bug
**Preconditions**: User is on a page with search functionality
**Steps**:
1. Navigate to the search page
2. Enter some text in the search field
3. Tab to the cross icon (ensure it's focused)
4. Press Enter key
**Expected Result**: Search field should be cleared
**Actual Result**: Redirects to search page without clearing field
**Priority**: High
**Status**: Bug - Needs Fix

### TC-03: Verify Cross Icon Focus State
**Objective**: Verify that the cross icon can receive focus properly
**Preconditions**: User is on a page with search functionality
**Steps**:
1. Navigate to the search page
2. Enter some text in the search field
3. Use Tab key to navigate to cross icon
4. Verify visual focus indicator
**Expected Result**: Cross icon shows focus state (outline, highlight, etc.)
**Priority**: Medium

### TC-04: Verify Cross Icon Accessibility
**Objective**: Verify cross icon is accessible via keyboard navigation
**Preconditions**: User is on a page with search functionality
**Steps**:
1. Navigate to the search page using only keyboard
2. Enter text in search field
3. Tab to cross icon
4. Verify screen reader announces the element properly
**Expected Result**: Cross icon is accessible and properly announced
**Priority**: Medium

### TC-05: Verify Cross Icon with Different Input Lengths
**Objective**: Test cross icon functionality with various input lengths
**Preconditions**: User is on a page with search functionality
**Test Data**: 
- Short text (1-5 characters)
- Medium text (10-50 characters)
- Long text (100+ characters)
**Steps**:
1. For each test data length:
   a. Enter text in search field
   b. Tab to cross icon
   c. Press Enter
**Expected Result**: Field is cleared regardless of input length
**Priority**: Low

### TC-06: Cross-Browser Testing
**Objective**: Verify the bug exists across different browsers
**Browsers**: Chrome, Firefox, Safari, Edge
**Steps**:
1. Repeat TC-02 in each browser
**Expected Result**: Consistent behavior across browsers
**Priority**: Medium

### TC-07: Verify Search Functionality After Bug Fix
**Objective**: Ensure normal search functionality works after fix
**Preconditions**: Bug has been fixed
**Steps**:
1. Enter search term
2. Press Enter or click search button
3. Verify search results are displayed
**Expected Result**: Search functionality works normally
**Priority**: High

## Test Data
- Search terms: "test", "product", "category", "long search term with multiple words"
- Special characters: "test@123", "search-term", "test & more"

## Risk Assessment
- **High Risk**: Search functionality is core feature
- **Medium Risk**: Accessibility compliance
- **Low Risk**: Cross-browser compatibility

## Exit Criteria
- All test cases pass
- Bug is fixed and verified
- No regression in search functionality
- Accessibility requirements met

## Notes
- Video attachment available showing the bug: 20251030-0942-08.4184672.mp4
- Time logged: 2 hours total (1h + 30m + 30m)
- Pull request is open for this issue
