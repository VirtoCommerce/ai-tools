# Test Cases for VCST-3292: [Mobile] Floating menu with button "Add to cart" on the product details page

## User Story Details
- **Jira Key**: VCST-3292
- **Summary**: [Mobile] Floating menu with button "Add to cart" on the product details page
- **Priority**: Medium
- **Status**: In progress
- **Created**: 5/15/2025

## Description
As a user I want to have a ADD TO CART button that leads me to the order so I can successfully order products I've added to cart.

---

## Test Cases

### Test Case 1: Verify Basic Functionality of Add to Cart Button
**Objective**: Verify that the floating Add to Cart button appears correctly and functions as expected

**Preconditions**:
- User is logged in
- User is on a product details page
- Product is in stock

**Test Steps**:
1. Navigate to any product details page
2. Scroll through the page
3. Click on the "Add to Cart" button
4. Observe the cart update
5. Click on the cart icon

**Expected Results**:
- Add to Cart button should be visible and floating at the bottom of the screen
- Button should remain visible while scrolling
- Product should be successfully added to cart
- Cart counter should increment
- User should be redirected to cart page

**Test Data**: Any available product
**Priority**: High

---

### Test Case 2: Verify Button Behavior with Out-of-Stock Products
**Objective**: Verify the Add to Cart button state for out-of-stock products

**Preconditions**:
- User is on a product details page
- Selected product is out of stock

**Test Steps**:
1. Navigate to an out-of-stock product
2. Observe the Add to Cart button state
3. Attempt to click the button

**Expected Results**:
- Button should be disabled
- Button text should change to "Out of Stock"
- No action should occur when clicked
- Appropriate message should be displayed

**Test Data**: Out-of-stock product
**Priority**: High

---

### Test Case 3: Verify Button Responsiveness Across Different Screen Sizes
**Objective**: Test the floating menu's responsive behavior

**Preconditions**:
- Access to different mobile devices or viewport sizes

**Test Steps**:
1. Open product page on different screen sizes:
   - Small phone (320px width)
   - Medium phone (375px width)
   - Large phone (425px width)
2. Rotate device between portrait and landscape
3. Observe button positioning and layout

**Expected Results**:
- Button should maintain proper positioning across all screen sizes
- Button should adjust width appropriately
- Text should remain readable
- No overlap with other UI elements

**Priority**: Medium

---

### Test Case 4: Verify Network Error Handling
**Objective**: Test Add to Cart functionality during network issues

**Preconditions**:
- User is on product details page
- Simulate poor/no network connection

**Test Steps**:
1. Enable offline mode or slow network
2. Click Add to Cart button
3. Restore network connection
4. Observe error handling

**Expected Results**:
- Appropriate error message should be displayed
- Retry option should be available
- Operation should complete once network is restored
- Cart should update correctly after successful retry

**Priority**: Medium

---

### Test Case 5: Verify Multiple Rapid Clicks Handling
**Objective**: Test system behavior when button is clicked multiple times rapidly

**Preconditions**:
- User is on product details page
- Product is in stock

**Test Steps**:
1. Click Add to Cart button multiple times rapidly
2. Check cart contents
3. Verify order quantity

**Expected Results**:
- System should prevent duplicate submissions
- Only one item should be added per intended click
- No system crashes or errors
- Appropriate feedback should be provided

**Priority**: Medium

---

### Test Case 6: Verify Button Interaction with Product Variants
**Objective**: Test Add to Cart functionality with product variants

**Preconditions**:
- Product has multiple variants (size, color, etc.)
- User is on product details page

**Test Steps**:
1. Select different product variants
2. Observe Add to Cart button state
3. Add different variants to cart
4. Verify cart contents

**Expected Results**:
- Button should be disabled until all required variants are selected
- Correct variant information should be added to cart
- Appropriate feedback for incomplete selections

**Priority**: High

---

## Edge Cases and Negative Tests

### Test Case 7: Verify Button Behavior During Page Load
**Objective**: Test button functionality during page loading states

**Preconditions**:
- Slow network connection
- Cache cleared

**Test Steps**:
1. Load product page with slow connection
2. Attempt to interact with button during loading
3. Observe button state and behavior

**Expected Results**:
- Button should not be clickable until page is fully loaded
- Loading state should be clearly indicated
- No JS errors should occur
- Button should function correctly after load completes

**Priority**: Low

---

## Notes
- Testing should be performed on various mobile devices and OS versions
- Pay special attention to performance impact of floating menu
- Consider accessibility requirements
- Related stories: Any cart functionality stories