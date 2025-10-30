# Test Cases for VCST-3728: Saved for later block in cart - display more than 6 items

## User Story Details
- **Jira Key**: VCST-3728
- **Summary**: Saved for later block in cart - display more than 6 items
- **Priority**: Medium
- **Status**: In review
- **Created**: 8/4/2025

## Description
Needs to decide whether we should show all saved products in the Saved for later block or not. We can add a carousel to this block or link to the wishlist with all products.

---

## Test Cases

### Test Case 1: Display Default View with 6 Items
**Objective**: Verify that the saved for later block displays up to 6 items correctly

**Preconditions**:
- User is logged in
- User has exactly 6 items saved for later
- User is on the cart page

**Test Steps**:
1. Navigate to the cart page
2. Locate the "Saved for Later" block
3. Count the number of displayed items
4. Verify the layout and spacing of items

**Expected Results**:
- All 6 items are displayed in a grid format
- Each item shows product image, title, and price
- No pagination or carousel controls are visible
- Layout is responsive and properly aligned

**Test Data**: 6 different products with varying titles and prices
**Priority**: High

---

### Test Case 2: Carousel Navigation with More Than 6 Items
**Objective**: Verify carousel functionality when more than 6 items are saved

**Preconditions**:
- User is logged in
- User has 10 items saved for later
- User is on the cart page

**Test Steps**:
1. Navigate to the cart page
2. Locate the "Saved for Later" block
3. Verify presence of carousel controls
4. Click next/previous arrows
5. Check item visibility after each navigation

**Expected Results**:
- First 6 items are initially visible
- Carousel navigation arrows are present and functional
- Items smoothly transition when navigating
- Item count indicator shows current position

**Test Data**: 10 different products
**Priority**: High

---

### Test Case 3: Wishlist Link Integration
**Objective**: Verify functionality of "View All in Wishlist" link

**Preconditions**:
- User has more than 6 saved items
- User is on the cart page

**Test Steps**:
1. Locate "View All in Wishlist" link
2. Click the link
3. Verify redirect to wishlist page
4. Confirm all saved items are present

**Expected Results**:
- Link is clearly visible
- Redirects to wishlist page
- All saved items are displayed in wishlist
- Navigation maintains user session

**Priority**: Medium

---

### Test Case 4: Empty State Display
**Objective**: Verify display when no items are saved for later

**Preconditions**:
- User is logged in
- No items saved for later
- User is on the cart page

**Test Steps**:
1. Navigate to cart page
2. Locate "Saved for Later" section

**Expected Results**:
- Appropriate empty state message displayed
- No carousel controls visible
- Section maintains proper layout
- Optional CTA to continue shopping

**Priority**: Medium

---

### Test Case 5: Maximum Items Boundary Test
**Objective**: Verify system behavior at maximum allowed saved items

**Preconditions**:
- User is logged in
- User has maximum allowed items saved (e.g., 50 items)

**Test Steps**:
1. Navigate to cart page
2. Attempt to save another item for later
3. Verify system response

**Expected Results**:
- Appropriate error message displayed
- Existing items remain unchanged
- User notified of item limit

**Test Data**: Maximum allowed items + 1
**Priority**: Medium

---

### Test Case 6: Response to Network Issues
**Objective**: Verify handling of network connectivity issues

**Preconditions**:
- User has saved items
- Network connection is unstable

**Test Steps**:
1. Load cart page with poor connection
2. Attempt carousel navigation
3. Simulate connection loss
4. Restore connection

**Expected Results**:
- Appropriate error handling
- Graceful degradation of carousel
- Recovery when connection restored
- No data loss

**Priority**: Low

---

## Edge Cases and Negative Tests

### Test Case 7: Cross-Browser Compatibility
**Objective**: Verify functionality across different browsers

**Preconditions**:
- Test environment setup with multiple browsers
- Items saved for later

**Test Steps**:
1. Test on Chrome, Firefox, Safari, Edge
2. Verify carousel functionality
3. Check responsive design
4. Validate navigation

**Expected Results**:
- Consistent behavior across browsers
- Proper rendering of all elements
- Carousel works as expected
- No visual glitches

**Priority**: High

---

## Notes
- Test cases assume responsive design requirements
- Additional accessibility testing recommended
- Performance testing for carousel animation needed
- Related to wishlist functionality stories
- Consider testing with different screen sizes