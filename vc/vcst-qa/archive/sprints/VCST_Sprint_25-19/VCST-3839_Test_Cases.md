# Test Cases for VCST-3839: [B2C SKU Selector] Keyboard navigation for options

## User Story Details
- **Jira Key**: VCST-3839
- **Summary**: [B2C SKU Selector] Keyboard navigation for options
- **Priority**: High
- **Status**: Done
- **Created**: 9/1/2025

## Description
As a customer using the B2C storefront, I want to navigate through SKU selector options using only my keyboard, so that I can select product variations without relying on a mouse, ensuring accessibility and a smoother shopping experience.

---

## Test Cases

### Test Case 1: Basic Tab Navigation Through SKU Options
**Objective**: Verify that users can navigate through SKU selector options using the Tab key

**Preconditions**:
- User is on the product details page [Product Details Page](https://docs.virtocommerce.org/help-center/storefront/product-page-personalization/)
- Product has multiple variations (e.g., Color and Size options)
- User is not using a mouse

**Test Steps**:
1. Press Tab key to focus on the first SKU option (Color)
2. Press Tab again to move to individual color choices
3. Press Tab to move to the Size option
4. Press Tab to navigate through size choices

**Expected Results**:
- Focus indicator clearly visible as user tabs through options
- Navigation sequence follows logical order from top to bottom
- Current focus is visually distinct and meets WCAG contrast requirements

**Priority**: High

---

### Test Case 2: Selection Using Space/Enter Keys
**Objective**: Verify option selection using keyboard input

**Preconditions**:
- User is on product details page
- SKU selector options are visible
- Focus is on a selectable option

**Test Steps**:
1. Navigate to a color option using Tab key
2. Press Space or Enter to select the option
3. Navigate to a size option
4. Press Space or Enter to select the size

**Expected Results**:
- Selected option is visually indicated
- Selection is registered in the system
- Price and availability update accordingly
- Focus remains on the selected option

**Priority**: High

---

### Test Case 3: Arrow Key Navigation Within Option Groups
**Objective**: Verify arrow key navigation within same-type options

**Preconditions**:
- Product has multiple options of the same type (e.g., multiple colors)
- Focus is on an option group

**Test Steps**:
1. Focus on the Color option group
2. Use Left/Right arrow keys to navigate between color choices
3. Use Up/Down arrow keys to navigate between rows (if applicable)
4. Verify wraparound navigation (last to first item)

**Expected Results**:
- Arrow keys move focus between options in the same group
- Navigation is circular within the group
- Visual focus indicator moves accordingly

**Priority**: High

---

### Test Case 4: Escape Key Functionality
**Objective**: Verify Escape key behavior for closing dropdowns/resetting selections

**Preconditions**:
- User has opened a dropdown SKU selector
- Some options are currently selected

**Test Steps**:
1. Press Escape key when dropdown is open
2. Press Escape key when an option is focused but not selected
3. Press Escape key after making a selection

**Expected Results**:
- Dropdown menus close when Escape is pressed
- Focus returns to parent element
- Selections remain unchanged when escaping after confirmation

**Priority**: Medium

---

### Test Case 5: Screen Reader Compatibility
**Objective**: Verify SKU selector accessibility with screen readers

**Preconditions**:
- Screen reader software is active (e.g., NVDA, JAWS)
- Product page is loaded with SKU options

**Test Steps**:
1. Navigate through options using screen reader commands
2. Verify announcement of option names and states
3. Select options using keyboard while screen reader is active

**Expected Results**:
- Screen reader announces option names correctly
- Selection state changes are announced
- Price and availability updates are announced

**Priority**: High

---

### Test Case 6: Keyboard Navigation with Invalid Combinations
**Objective**: Verify behavior when navigating to invalid SKU combinations

**Preconditions**:
- Product has certain invalid color-size combinations

**Test Steps**:
1. Use keyboard to select a valid color
2. Tab to size options
3. Attempt to select an unavailable size

**Expected Results**:
- Unavailable options are clearly indicated
- Cannot select invalid combinations
- Screen reader announces unavailability

**Priority**: Medium

---

## Edge Cases and Negative Tests

### Test Case 7: Rapid Keyboard Input Handling
**Objective**: Verify system handles rapid keyboard input correctly

**Test Steps**:
1. Rapidly press Tab multiple times
2. Quickly alternate between arrow keys
3. Press multiple keys simultaneously

**Expected Results**:
- System maintains correct focus order
- No UI glitches or performance issues
- Selections remain accurate

**Priority**: Medium

---

## Notes
- All keyboard interactions should follow [WCAG 2.1 guidelines](https://www.w3.org/WAI/WCAG21/Understanding/)
- Test cases should be executed on different browsers
- Related to accessibility compliance requirements
- Consider testing with various keyboard layouts

These test cases focus on ensuring complete keyboard accessibility while maintaining a smooth user experience for customers who rely on keyboard navigation.