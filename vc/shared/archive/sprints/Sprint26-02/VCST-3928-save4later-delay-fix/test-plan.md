# Test Plan: VCST-3928 - Save4later Delay Fix

## Test Information
- **Ticket:** VCST-3928
- **Title:** [Save4later] The long delay between click on button and removed line-item from cart
- **Type:** Bug Fix
- **Priority:** High
- **Tester:** Elena Mutykova (via AI Assistant)
- **Test Date:** November 5, 2025
- **Frontend Version:** Ver. 2.35.0-pr-1956-5412-5412bdfc 

## Story Summary
This bug addresses the 2-second delay between clicking the "Save for later" button and the line item being removed from the cart. The fix implements optimistic responses and improved error handling to provide immediate visual feedback to users.

## Test Objectives
1. Verify that "Save for later" operations provide immediate visual feedback
2. Ensure cart quantities are correctly maintained during operations
3. Test error handling under various load conditions
4. Validate the user experience improvements

## Test Environment
- **URL:** https://vcst-qa-storefront.govirto.com/
- **Browser:** Chrome (via Chrome DevTools MCP)
- **User Account:** USER2 (authenticated user)

## Test Scenarios

### TC-001: Basic Save for Later Functionality
**Objective:** Verify basic save for later operation works correctly
**Priority:** Critical

**Pre-conditions:**
- User is signed in as USER2
- Cart contains multiple products

**Test Steps:**
1. Navigate to cart page
2. Identify a product in the cart
3. Click "Save for later" button
4. Observe the visual response time
5. Verify product is moved to "Saved for later" section
6. Check cart total is updated correctly

**Expected Results:**
- Product disappears from cart immediately (optimistic response)
- Product appears in "Saved for later" section after server response
- Cart total is updated correctly
- No visual delays or flickering

### TC-002: Move from Saved for Later to Cart
**Objective:** Verify moving items back to cart works correctly
**Priority:** Critical

**Pre-conditions:**
- User has items in "Saved for later" section

**Test Steps:**
1. Navigate to cart page
2. Locate "Saved for later" section
3. Click "Move to cart" button on a saved item
4. Observe response time and visual feedback
5. Verify item appears in cart
6. Check quantity handling

**Expected Results:**
- Item disappears from "Saved for later" immediately
- Item appears in cart after server response
- Quantities are handled correctly (no duplication/loss)
- Cart total updates properly

### TC-003: Rapid Clicking Test
**Objective:** Test system behavior under rapid user interactions
**Priority:** High

**Pre-conditions:**
- Cart contains multiple products (5+ items)

**Test Steps:**
1. Rapidly click "Save for later" on multiple items
2. Observe system behavior and error handling
3. Check for any "Service is busy" errors
4. Verify final state consistency

**Expected Results:**
- System handles rapid clicks gracefully
- No data loss or corruption
- Appropriate error messages if service is busy
- Final cart state is consistent

### TC-004: Quantity Management Test
**Objective:** Verify correct quantity handling during operations
**Priority:** High

**Pre-conditions:**
- Cart contains products with quantities > 1

**Test Steps:**
1. Add product A to cart (quantity = 2)
2. Save product A for later
3. Add same product A to cart again (quantity = 1)
4. Move saved product A back to cart
5. Verify final quantity

**Expected Results:**
- Final quantity should be 3 (2 + 1)
- No quantity loss or unexpected increases
- Cart total reflects correct quantities

### TC-005: Error Handling Test
**Objective:** Test system behavior when server errors occur
**Priority:** Medium

**Pre-conditions:**
- Ability to simulate server delays/errors

**Test Steps:**
1. Perform save for later operation
2. Observe behavior if server request fails
3. Check error messages and recovery
4. Verify data consistency

**Expected Results:**
- Appropriate error messages displayed
- Items revert to original state on failure
- No data corruption
- User can retry operation

### TC-006: Anonymous User Test
**Objective:** Verify save for later works for anonymous users
**Priority:** Medium

**Pre-conditions:**
- User is not signed in

**Test Steps:**
1. Add products to cart as anonymous user
2. Attempt to use "Save for later" functionality
3. Observe behavior and messaging

**Expected Results:**
- Appropriate handling for anonymous users
- No unexpected errors or crashes
- Clear messaging about authentication requirements

### TC-007: Performance Test
**Objective:** Measure response times and performance
**Priority:** Medium

**Pre-conditions:**
- Cart with 10+ products

**Test Steps:**
1. Measure time from click to visual response
2. Measure time for server operation completion
3. Test with different cart sizes
4. Monitor network requests

**Expected Results:**
- Visual response < 100ms (optimistic)
- Server response < 3 seconds under normal load
- No unnecessary network requests
- Smooth user experience

## Test Data Requirements
- Multiple product types (simple products, products with variations)
- Different quantity scenarios (1, 5, 10+ items)
- Mix of product categories

## Risk Areas
1. **Quantity Management:** Risk of product duplication or loss
2. **Concurrency:** Multiple rapid operations causing conflicts
3. **Error Recovery:** System state after failed operations
4. **Performance:** Response times under load

## Success Criteria
- All critical test cases pass
- No data loss or corruption
- Response times meet performance targets
- Error handling is robust and user-friendly
- User experience is significantly improved from previous version

## Notes
- Previous testing revealed issues with:
  - ServiceAccessLocked errors under rapid clicking
  - Quantity inconsistencies in some scenarios
  - getSavedForLater requests for anonymous users
- Current implementation includes optimistic responses and distributed locking
