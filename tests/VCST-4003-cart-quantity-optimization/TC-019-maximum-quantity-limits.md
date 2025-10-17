# TC-019: Maximum Quantity Limits and Boundary Testing

## Test Case Information

**Test Case ID**: TC-019  
**Test Case Title**: Verify Maximum Quantity Limits and Boundary Conditions  
**Related Story**: [VCST-4003](https://virtocommerce.atlassian.net/browse/VCST-4003)  
**Priority**: Medium  
**Test Type**: Boundary Testing / Edge Case  
**Estimated Time**: 15 minutes

---

## Description

Verify that the system correctly enforces maximum quantity limits for products, handles boundary conditions (minimum and maximum values), and provides appropriate feedback when limits are reached. Ensure no integer overflow or underflow issues.

---

## Preconditions

1. User is logged into the VirtoCommerce platform
2. User is on a category page with products
3. Products have various quantity limits configured
4. Understanding of system's quantity limits

---

## Test Data

- **Test User**: `test_user@example.com`
- **Products**:
  - Product A: No limit or high limit (9999+)
  - Product B: Limited quantity (e.g., max 10)
  - Product C: Low stock (e.g., only 3 available)
  - Product D: Limited per order (e.g., max 5 per order)

---

## Test Steps

### Step 1: Identify System-Wide Maximum Limit
1. Determine if there's a system-wide max quantity (e.g., 9999)
2. Document this limit
3. Test if it applies to all products

**Expected Result**:
- System maximum documented (e.g., 9999)
- OR no system max, only product-specific limits

---

### Step 2: Test at System Maximum
1. Find product with no/high limit
2. Set quantity to system maximum (e.g., 9999)
3. Verify acceptance

**Expected Result**:
- Quantity accepted if at or below system max
- Mutation successful
- Cart total calculates correctly
- No integer overflow

---

### Step 3: Test Above System Maximum
1. Try to set quantity above system max (e.g., 10000)
2. Observe behavior

**Expected Result**:
- System either:
  - **Caps at maximum**: Automatically sets to 9999
  - **Shows error**: "Maximum quantity is 9999"
  - **Prevents input**: Cannot type higher number
- Clear feedback to user

---

### Step 4: Test Product-Specific Limit
1. Locate product with specific limit (e.g., "Max 10 per order")
2. Try to set quantity to 10 (at limit)
3. Try to set quantity to 11 (above limit)

**Expected Result**:
- Quantity of 10: Accepted
- Quantity of 11: Rejected with error message
- Error: "Maximum quantity for this product is 10"
- User understands the limit

---

### Step 5: Test Stock Availability Limit
1. Product has limited stock (e.g., only 3 in stock)
2. Try to add 4 to cart

**Expected Result**:
- System either:
  - **Caps at available**: Sets to 3 with message "Only 3 available"
  - **Shows error**: "Requested quantity not available"
  - **Allows overselling**: If overselling is enabled
- Clear communication to user

---

### Step 6: Test Minimum Quantity
1. Check if products have minimum order quantity (MOQ)
2. Try to set below MOQ (e.g., MOQ is 5, try to set 3)

**Expected Result**:
- If MOQ enforced:
  - Quantity below MOQ rejected
  - Error: "Minimum order quantity is 5"
- OR quantity of 1 always allowed (no MOQ)

---

### Step 7: Increment to Reach Limit
1. Product with max 10
2. Set quantity to 9
3. Click + button (should go to 10)
4. Click + button again (should stay at 10 or show error)

**Expected Result**:
- At limit: + button disabled OR shows error
- Clear indication that limit reached
- User cannot exceed limit

---

### Step 8: Type Quantity Beyond Limit
1. Product with max 10
2. Clear field and type "50"
3. Press Enter

**Expected Result**:
- Error message: "Maximum quantity is 10"
- OR automatically capped to 10
- Clear feedback

---

### Step 9: Multiple Products at Maximum
1. Add multiple products, each at their maximum
2. Calculate total cart quantity
3. Verify cart functions properly

**Expected Result**:
- Cart accepts multiple products at max
- Total quantity can be very high (sum of all products)
- Cart calculations correct
- System performance acceptable

---

### Step 10: Integer Boundaries (32-bit)
1. Try quantities at or near integer limits:
   - 2,147,483,647 (max 32-bit signed integer)
   - 4,294,967,295 (max 32-bit unsigned integer)
2. Observe behavior

**Expected Result**:
- System rejects unrealistic quantities
- No integer overflow
- Graceful error handling
- System remains stable

---

### Step 11: Quantity Exceeds Cart Total Limit
1. If cart has total item limit (e.g., max 100 items total)
2. Try to exceed this limit across multiple products

**Expected Result**:
- System enforces total cart limit
- Error: "Cart cannot exceed 100 items"
- User aware of overall limit

---

### Step 12: Fractional Stock (Edge Case)
1. If fractional stock is possible (0.5 kg, etc.)
2. Test quantity adjustments

**Expected Result**:
- System handles per product type:
  - Integer products: No fractions
  - Weight/measure products: Fractions allowed if configured
- Appropriate validation

---

### Step 13: Negative Boundary
1. Try to set quantity to INT_MIN or very negative number
2. Observe validation

**Expected Result**:
- Rejected as per TC-016
- No integer underflow
- System stable

---

### Step 14: Zero Boundary
1. Set quantity to 0
2. Verify removal (as per TC-006)

**Expected Result**:
- Product removed from cart
- Expected behavior per requirements

---

### Step 15: Limit Changes While User is Editing
**Edge Scenario**:
1. Product max is 10
2. User has 8 in cart
3. Admin changes max to 5 (while user is on page)
4. User tries to increase to 9

**Expected Result**:
- Server validates against current limit (5)
- Error: "Quantity exceeds current limit"
- User informed of new limit
- No stale data issues

---

### Step 16: Personalized Limits (If Applicable)
1. If different users have different limits (VIP, wholesale, etc.)
2. Test with various user types

**Expected Result**:
- Limits enforced per user type
- Clear communication of user's specific limits
- No privilege escalation

---

### Step 17: Multiple Increments to Boundary
1. Start at quantity 1
2. Rapidly click + button to approach limit
3. Continue clicking past limit

**Expected Result**:
- Increments stop at limit
- Clear indication (button disabled, error message)
- No exceeding limit

---

### Step 18: API Direct Testing (If Accessible)
1. Use GraphQL Playground or Postman
2. Send mutation with quantity above limit
3. Verify server-side validation

**Expected Result**:
- **Server-side validation enforces limits**
- Cannot bypass limits via direct API call
- Security: Client-side validation not sole enforcement

---

## Boundary Values to Test

| Boundary | Value | Purpose |
|----------|-------|---------|
| Minimum | 0 | Remove item |
| Minimum | 1 | Smallest cart quantity |
| Product MOQ | e.g., 5 | Minimum order quantity |
| Product Max | e.g., 10 | Maximum per order |
| Stock Limit | e.g., 3 | Available quantity |
| System Max | e.g., 9999 | System-wide limit |
| Very Large | 999,999 | Unrealistic quantity |
| INT_MAX | 2,147,483,647 | Integer overflow test |

---

## Expected Results Summary

✅ **Enforces Limits**: All quantity limits properly enforced  
✅ **Clear Messages**: User understands limits and why exceeded  
✅ **No Overflow**: No integer overflow/underflow issues  
✅ **Product-Specific**: Respects individual product limits  
✅ **Stock-Aware**: Considers available stock  
✅ **Server Validation**: Server-side enforcement (not just client)  
✅ **Boundary Handling**: Correct behavior at all boundaries  
✅ **Disabled Controls**: + button disabled or shows error at limit

---

## Actual Results

**Execution Date**: ___________  
**Executed By**: ___________  
**Browser**: ___________  
**Environment**: ___________

### Observations:
```
[To be filled during test execution]

System-wide maximum: ___
Product-specific maximum (if any): ___
Minimum order quantity (if any): ___

Boundary Test Results:
- Quantity at max: Accepted/Rejected
- Quantity above max: Error message: "___"
- + button at limit: Disabled/Shows error/Allows
- Very large number (999999): Capped at ___ / Error
- Integer overflow test: Handled correctly: Yes/No

Stock limit enforced: Yes/No
Server-side validation confirmed: Yes/No
```

---

## Pass/Fail Criteria

**Pass**: 
- All quantity limits enforced correctly
- Clear error messages when limits exceeded
- No integer overflow/underflow
- Product-specific and stock limits respected
- Server-side validation in place
- + button disabled or shows error at limit
- Graceful handling of all boundaries

**Fail**: 
- Limits can be bypassed
- No error messages or unclear messages
- Integer overflow/underflow occurs
- Limits not enforced consistently
- No server-side validation
- System crashes at boundaries

---

## Status

- [ ] Not Executed
- [ ] Pass
- [ ] Fail
- [ ] Blocked

---

## Defects

| Defect ID | Description | Severity | Status |
|-----------|-------------|----------|--------|
| | | | |

---

## Notes

- Boundary testing is critical for data integrity
- Always test server-side validation (client-side can be bypassed)
- Document all limits for user-facing documentation
- Consider UX: How to clearly communicate limits to users
- Test with actual product data (real stock levels, real limits)
- Verify limit enforcement across all cart operations (not just category page)

---

## Limit Types Reference

Different types of limits that may exist:

1. **System Maximum**: Overall system limit (e.g., 9999)
2. **Product Maximum**: Per-product limit (e.g., "Max 10 per order")
3. **Stock Availability**: Physical stock limitation
4. **Minimum Order Quantity (MOQ)**: Minimum required (e.g., "Buy at least 5")
5. **Cart Total Limit**: Maximum total items in cart
6. **User-Specific**: Different limits per user type (wholesale, retail)
7. **Promotion-Based**: Special limits during sales

---

## Screenshots/Evidence

[Attach screenshots or video recordings here]

1. Error message when exceeding product maximum
2. + button disabled at limit
3. Stock availability message
4. System maximum enforcement
5. Server-side validation response (API)

