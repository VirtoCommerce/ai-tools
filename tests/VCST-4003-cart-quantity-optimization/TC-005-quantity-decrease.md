# TC-005: Quantity Decrease Operations

## Test Case Information

**Test Case ID**: TC-005  
**Test Case Title**: Verify Product Quantity Decrease Functionality  
**Related Story**: [VCST-4003](https://virtocommerce.atlassian.net/browse/VCST-4003)  
**Priority**: High  
**Test Type**: Functional  
**Estimated Time**: 10 minutes

---

## Description

Verify that users can successfully decrease product quantities on the category page using the "-" button or by typing a lower number directly into the quantity input field. Ensure the cart updates correctly and the UI reflects the changes.

---

## Preconditions

1. User is logged into the VirtoCommerce platform
2. User has navigated to a category page with products
3. At least one product is in the cart with quantity ≥ 5
4. Browser DevTools is available for verification

---

## Test Data

- **Test User**: `test_user@example.com`
- **Product**: Any product available in category
- **Initial Quantity**: 5

---

## Test Steps

### Step 1: Verify Initial State
1. Navigate to category page
2. Locate a product with quantity = 5 in cart
3. Note the current cart total count
4. Note the current quantity displayed

**Expected Result**: Product shows quantity "5", cart icon shows correct total count

---

### Step 2: Decrease Quantity Using - Button (Single Click)
1. Click the "-" button once on the quantity selector
2. Observe immediate UI update
3. Wait for mutation to complete
4. Verify cart icon updates

**Expected Result**:
- Quantity immediately decreases from 5 to 4
- Cart icon count decreases by 1
- No errors in console
- GraphQL mutation sent after 1-second debounce

---

### Step 3: Decrease Quantity Using - Button (Multiple Clicks)
1. Click the "-" button 3 times rapidly
2. Observe UI updates for each click
3. Wait for mutation to complete
4. Refresh page and verify persistence

**Expected Result**:
- Quantity decreases with each click: 4 → 3 → 2 → 1
- UI updates immediately for each click
- All changes batched into single mutation
- After page refresh, quantity remains 1

---

### Step 4: Decrease Quantity by Typing
1. Ensure product has quantity ≥ 10
2. Click into the quantity input field
3. Clear existing value
4. Type "3"
5. Press Enter or click outside the field
6. Wait for mutation to complete

**Expected Result**:
- Quantity updates to 3 immediately
- Cart icon reflects new total (decrease)
- Mutation sent after 1-second debounce
- Quantity persists after page refresh

---

### Step 5: Decrease to Minimum (Not Zero)
1. Locate a product with quantity = 2
2. Click "-" button once to decrease to 1
3. Verify product remains in cart
4. Verify "-" button state

**Expected Result**:
- Quantity decreases to 1
- Product remains in cart
- "-" button may be disabled or clicking it would remove item (tested in TC-006)

---

### Step 6: Decrease by Large Amount
1. Set product quantity to 100 (type in field)
2. Wait for mutation to complete
3. Click into quantity field and type "5"
4. Press Enter

**Expected Result**:
- Quantity decreases from 100 to 5
- Cart icon reflects large decrease
- Mutation completes successfully
- No performance issues

---

### Step 7: Decrease Multiple Products Simultaneously
1. Ensure 3 products in cart with quantities ≥ 3
2. Decrease quantity of Product A (click - twice)
3. Immediately decrease quantity of Product B (click - once)
4. Immediately decrease quantity of Product C (click - three times)
5. Wait for mutation and verify all changes

**Expected Result**:
- All UI updates happen immediately
- Single mutation sent with all three products
- Cart icon reflects total decrease (2+1+3 = 6 fewer items)
- All quantities persisted correctly

---

### Step 8: Type Lower Value Than Current
1. Product has quantity = 20
2. Click into quantity field
3. Type "8"
4. Press Enter

**Expected Result**:
- Quantity updates to 8
- Cart total decreases by 12
- Mutation sent successfully

---

### Step 9: Invalid Decrease Values
1. Click into quantity field
2. Type "0" (zero)
3. Press Enter
4. Observe behavior (should remove item - see TC-006)

**Expected Result**:
- Product removed from cart (quantity = 0 behavior)
- OR validation message shown
- Handled per requirements in TC-006

---

### Step 10: Negative Number Handling
1. Click into quantity field
2. Type "-5" (negative number)
3. Press Enter
4. Observe behavior

**Expected Result**:
- System either:
  - Prevents negative entry
  - Shows validation error
  - Converts to positive or removes item
- No application crash

---

### Step 11: Verify Cart Synchronization
1. Decrease product quantity on category page
2. Open mini-cart or navigate to cart page
3. Verify quantity matches

**Expected Result**:
- Quantity in cart matches category page quantity
- Cart subtotal recalculated correctly
- All product details accurate

---

## Expected Results Summary

✅ **Single Decrease**: - button decreases quantity by 1  
✅ **Multiple Decreases**: Rapid clicks decrement correctly  
✅ **Type Input**: Direct typing updates quantity  
✅ **Large Decreases**: Handles large quantity reductions  
✅ **Multiple Products**: Can update multiple products simultaneously  
✅ **Cart Sync**: Cart reflects all quantity changes  
✅ **Validation**: Invalid/negative inputs handled gracefully  
✅ **Minimum Quantity**: Properly handles quantity = 1

---

## Actual Results

**Execution Date**: ___________  
**Executed By**: ___________  
**Browser**: ___________  
**Environment**: ___________

### Observations:
```
[To be filled during test execution]

Minimum allowed quantity: ___
Negative number handling: ___
Behavior at quantity = 1: ___
```

---

## Pass/Fail Criteria

**Pass**: 
- All quantity decrease operations work correctly
- UI updates immediately
- Cart synchronizes properly
- Invalid inputs handled gracefully
- No console errors

**Fail**: 
- Quantity doesn't decrease
- UI doesn't update immediately
- Cart doesn't synchronize
- Application crashes on invalid input

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

- Test interaction between decrease and minimum quantity limits
- Verify pricing updates correctly with quantity changes
- Observe - button state when quantity = 1
- Test with products that have minimum order quantities

---

## Screenshots/Evidence

[Attach screenshots or video recordings here]

1. Before quantity decrease
2. After single - click
3. After multiple rapid clicks
4. Typing lower quantity
5. Cart synchronization verification
6. Handling of negative/zero values

