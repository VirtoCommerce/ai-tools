# Test Cases for VCST-4104: Implement keyboard navigation in add-to-wishlists-modal

## User Story Details
- **Jira Key**: VCST-4104
- **Summary**: Implement keyboard navigation in add-to-wishlists-modal
- **Priority**: Medium
- **Status**: REFINEMENT
- **Created**: 10/14/2025

## Description
No description provided

---

## Test Cases

### Test Case 1: Basic Tab Navigation Through Modal Elements
**Objective**: Verify that users can navigate through all interactive elements using the Tab key

**Preconditions**:
- User is logged in
- Add-to-wishlists modal is open
- Focus is on the modal

**Test Steps**:
1. Press Tab key
2. Continue pressing Tab to cycle through all interactive elements
3. Press Shift+Tab to navigate backwards

**Expected Results**:
- Tab key should move focus through elements in logical order
- Focus order: Close button > Wishlist options > Create new list button > Cancel button > Save button
- Focus should be visually indicated
- Focus should wrap around to the first element after the last

**Test Data**: N/A

**Priority**: High

---

### Test Case 2: Enter Key Selection
**Objective**: Verify that focused elements can be activated using the Enter key

**Preconditions**:
- Add-to-wishlists modal is open
- User has existing wishlists

**Test Steps**:
1. Tab to a wishlist option
2. Press Enter key
3. Tab to Save button
4. Press Enter key

**Expected Results**:
- Wishlist should be selected when Enter is pressed
- Save button should execute when Enter is pressed
- Modal should close after successful save
- Visual feedback should be provided for selections

**Priority**: High

---

### Test Case 3: Escape Key Modal Dismissal
**Objective**: Verify that the modal can be dismissed using the Escape key

**Preconditions**:
- Add-to-wishlists modal is open
- Changes may or may not have been made

**Test Steps**:
1. Make some selections in the modal
2. Press Escape key

**Expected Results**:
- Modal should close immediately
- No changes should be saved
- Focus should return to the element that opened the modal

**Priority**: Medium

---

### Test Case 4: Space Bar Selection for Checkboxes
**Objective**: Verify that checkboxes can be toggled using the Space bar

**Preconditions**:
- Modal is open with multiple wishlist options
- Focus is on a wishlist checkbox

**Test Steps**:
1. Navigate to a wishlist checkbox using Tab
2. Press Space bar
3. Press Space bar again

**Expected Results**:
- Space bar should toggle checkbox state
- Visual feedback should be provided
- Selection should be maintained when tabbing away and back

**Priority**: Medium

---

### Test Case 5: Arrow Key Navigation in Wishlist Options
**Objective**: Verify that arrow keys can be used to navigate between wishlist options

**Test Steps**:
1. Focus on first wishlist option
2. Press Down arrow key
3. Press Up arrow key
4. Press Right and Left arrow keys

**Expected Results**:
- Up/Down arrows should move between wishlist options
- Right/Left arrows should not change focus
- Visual focus indicator should move accordingly

**Priority**: Medium

---

### Test Case 6: Creation of New Wishlist Using Keyboard
**Objective**: Verify new wishlist creation process using keyboard only

**Test Steps**:
1. Tab to "Create New List" button
2. Press Enter
3. Type wishlist name
4. Press Enter to confirm

**Expected Results**:
- New wishlist input field should appear and receive focus
- Enter should confirm creation
- Escape should cancel creation
- New wishlist should be selected after creation

**Priority**: High

---

### Test Case 7: Focus Trap Within Modal
**Objective**: Verify that keyboard focus remains trapped within the modal

**Test Steps**:
1. Open modal
2. Repeatedly press Tab key until reaching last element
3. Press Tab again
4. Press Shift+Tab at first element

**Expected Results**:
- Focus should cycle within modal
- Focus should not escape to elements behind modal
- Focus should wrap from last to first element and vice versa

**Priority**: High

---

## Edge Cases and Negative Tests

### Test Case 8: Modal Keyboard Navigation with Screen Reader
**Objective**: Verify keyboard navigation compatibility with screen readers

**Test Steps**:
1. Enable screen reader
2. Navigate through modal using keyboard
3. Verify announcements of elements and their states

**Expected Results**:
- All elements should be properly announced
- State changes should be communicated
- Focus order should make logical sense for screen reader users

**Priority**: High

---

## Notes
- All keyboard interactions should follow WCAG 2.1 accessibility guidelines
- Test with different screen readers (NVDA, VoiceOver, JAWS)
- Verify that keyboard navigation works across different browsers
- Consider testing with different keyboard layouts