# Test Cases for VCST-4084: Save for later - Display All - Management in my account

## User Story Details
- **Jira Key**: VCST-4084
- **Summary**: Save for later - Display All - Management in my account
- **Priority**: Medium
- **Status**: Ready for test
- **Created**: 10/9/2025

## Description
As a Customer, I want to see Save for later products as part of my menu, so that I can review it, clean up., etc.

---

## Test Cases

### Test Case 1: Verify Save for Later Menu Access
**Objective**: Verify that logged-in customers can access the Save for Later menu in their account

**Preconditions**:
- User has an active account
- User is logged in
- User has previously saved items for later

**Test Steps**:
1. Navigate to My Account section
2. Look for "Save for Later" menu option
3. Click on "Save for Later" menu item

**Expected Results**:
- Save for Later section is accessible from My Account menu
- Save for Later page loads successfully
- Previously saved items are displayed

**Test Data**: Valid user credentials
**Priority**: High

---

### Test Case 2: Display Saved Items List
**Objective**: Verify proper display of all saved items with correct information

**Preconditions**:
- User is logged in
- Multiple items are saved for later

**Test Steps**:
1. Access Save for Later section
2. Verify display of item details:
   - Product image
   - Product name
   - Price
   - Date saved
3. Scroll through entire list

**Expected Results**:
- All saved items are displayed
- Each item shows correct information
- List is properly formatted and readable
- Pagination works if applicable

**Test Data**: Account with 10+ saved items
**Priority**: High

---

### Test Case 3: Remove Single Item
**Objective**: Verify ability to remove individual items from Save for Later list

**Preconditions**:
- User is logged in
- At least one item in Save for Later list

**Test Steps**:
1. Access Save for Later section
2. Locate remove/delete button for specific item
3. Click remove button
4. Confirm deletion if prompted

**Expected Results**:
- Item is successfully removed
- Confirmation message appears
- List updates immediately
- Removed item no longer appears in list

**Test Data**: Single saved item
**Priority**: Medium

---

### Test Case 4: Bulk Delete Items
**Objective**: Verify ability to remove multiple saved items simultaneously

**Preconditions**:
- User is logged in
- Multiple items in Save for Later list

**Test Steps**:
1. Access Save for Later section
2. Select multiple items using checkboxes
3. Click bulk delete option
4. Confirm deletion

**Expected Results**:
- Selected items are removed
- Confirmation message appears
- List updates correctly
- Item count updates accurately

**Test Data**: Multiple saved items
**Priority**: Medium

---

### Test Case 5: Empty State Display
**Objective**: Verify proper display when no items are saved

**Preconditions**:
- User is logged in
- No items in Save for Later list

**Test Steps**:
1. Access Save for Later section
2. Observe empty state message

**Expected Results**:
- Appropriate empty state message displayed
- Suggestions for adding items shown if applicable
- Layout remains intact

**Test Data**: Account with no saved items
**Priority**: Medium

---

### Test Case 6: Move to Cart Functionality
**Objective**: Verify ability to move items from Save for Later to shopping cart

**Preconditions**:
- User is logged in
- Items present in Save for Later list

**Test Steps**:
1. Access Save for Later section
2. Click "Move to Cart" button for an item
3. Verify cart update
4. Check Save for Later list update

**Expected Results**:
- Item successfully moves to cart
- Item removes from Save for Later list
- Cart count updates
- Confirmation message appears

**Test Data**: Valid saved item
**Priority**: High

---

## Edge Cases and Negative Tests

### Test Case 7: Session Timeout Handling
**Objective**: Verify system behavior when session expires while managing saved items

**Preconditions**:
- User session near timeout
- Active Save for Later page

**Test Steps**:
1. Wait for session timeout
2. Attempt to perform actions on saved items
3. Observe system response

**Expected Results**:
- Appropriate session timeout message
- User data preserved
- Redirect to login page
- No data loss after re-login

**Test Data**: Session timeout configuration
**Priority**: Low

---

### Test Case 8: Invalid Item Handling
**Objective**: Verify system handling of saved items that become invalid/unavailable

**Preconditions**:
- User has saved items
- One or more items become unavailable

**Test Steps**:
1. Access Save for Later list
2. Observe display of unavailable items
3. Attempt actions on unavailable items

**Expected Results**:
- Clear indication of unavailable status
- Appropriate messaging
- Option to remove invalid items
- System stability maintained

**Test Data**: Unavailable product IDs
**Priority**: Medium

---

## Notes
- Test across different browsers and devices
- Verify performance with large numbers of saved items
- Check integration with shopping cart system
- Verify proper handling of special characters in product names
- Test accessibility compliance