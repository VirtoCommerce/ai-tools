# TC-004: Quantity Increase Operations

## Test Case Information

**Test Case ID**: TC-004  
**Test Case Title**: Verify Product Quantity Increase Functionality  
**Related Story**: [VCST-4003](https://virtocommerce.atlassian.net/browse/VCST-4003)  
**Priority**: High  
**Test Type**: Functional  
**Estimated Time**: 10 minutes

---

## Description

Verify that users can successfully increase product quantities on the category page using the "+" button or by typing a higher number directly into the quantity input field. Ensure the cart updates correctly and the UI reflects the changes.

---

## Preconditions

1. User is logged into the VirtoCommerce platform
2. User has navigated to a category page with products
3. At least one product is in the cart with quantity ≥ 1
4. Browser DevTools is available for verification

---

## Test Data

- **Test User**: `test_user@example.com`
- **Product**: Any product available in category
- **Initial Quantity**: 1

---

## Test Steps

### Step 1: Verify Initial State
1. Navigate to category page
2. Locate a product with quantity = 1 in cart
3. Note the current cart total count
4. Note the current quantity displayed

**Expected Result**: Product shows quantity "1", cart icon shows correct total count

---

### Step 2: Increase Quantity Using + Button (Single Click)
1. Click the "+" button once on the quantity selector
2. Observe immediate UI update
3. Wait for mutation to complete
4. Verify cart icon updates

**Expected Result**:
- Quantity immediately increases from 1 to 2
- Cart icon count increases by 1
- No errors in console
- GraphQL mutation sent after 1-second debounce

---

### Step 3: Increase Quantity Using + Button (Multiple Clicks)
1. Click the "+" button 5 times rapidly
2. Observe UI updates for each click
3. Wait for mutation to complete
4. Refresh page and verify persistence

**Expected Result**:
- Quantity increases with each click: 2 → 3 → 4 → 5 → 6 → 7
- UI updates immediately for each click
- All changes batched into single mutation
- After page refresh, quantity remains 7

---

### Step 4: Increase Quantity by Typing
1. Click into the quantity input field
2. Clear existing value
3. Type "15"
4. Press Enter or click outside the field
5. Wait for mutation to complete

**Expected Result**:
- Quantity updates to 15 immediately
- Cart icon reflects new total
- Mutation sent after 1-second debounce
- Quantity persists after page refresh

---

### Step 5: Increase from Zero to Positive (Re-add)
1. Find a product NOT in cart (quantity = 0 or no quantity shown)
2. Click "Add to Cart" or click "+" button
3. Verify product is added with quantity = 1
4. Click "+" again to increase to 2

**Expected Result**:
- Product added to cart with quantity = 1
- Subsequent click increases to 2
- Cart icon updates correctly
- Product now appears in mini-cart

---

### Step 6: Large Quantity Increase
1. Locate a product with quantity = 1
2. Click into quantity field and type "999"
3. Press Enter
4. Observe behavior

**Expected Result**:
- If within allowed limits: Quantity updates to 999
- If exceeds limits: Error message shown or capped at maximum allowed
- No application crash or console errors
- Mutation sent with appropriate value

---

### Step 7: Increase Multiple Products Simultaneously
1. Increase quantity of Product A (click + twice)
2. Immediately increase quantity of Product B (click + three times)
3. Immediately increase quantity of Product C (click + once)
4. Wait for mutation and verify all changes

**Expected Result**:
- All UI updates happen immediately
- Single mutation sent with all three products
- Cart icon reflects total increase (2+3+1 = 6 additional items)
- All quantities persisted correctly

---

### Step 8: Verify Cart Synchronization
1. Increase product quantity on category page
2. Open mini-cart or navigate to cart page
3. Verify quantity matches

**Expected Result**:
- Quantity in cart matches category page quantity
- Cart subtotal recalculated correctly
- All product details accurate

---

### Step 9: Decimal/Invalid Input Handling
1. Click into quantity field
2. Type "5.5" (decimal number)
3. Press Enter
4. Observe behavior

**Expected Result**:
- System either:
  - Rounds to nearest integer (5 or 6), or
  - Shows validation error, or
  - Prevents decimal entry
- No application crash

---

## Expected Results Summary

✅ **Single Increase**: + button increases quantity by 1  
✅ **Multiple Increases**: Rapid clicks increment correctly  
✅ **Type Input**: Direct typing updates quantity  
✅ **Zero to Positive**: Can add product to cart  
✅ **Large Quantities**: Handles large numbers appropriately  
✅ **Multiple Products**: Can update multiple products simultaneously  
✅ **Cart Sync**: Cart reflects all quantity changes  
✅ **Validation**: Invalid inputs handled gracefully

---

## Actual Results

**Execution Date**: ___________  
**Executed By**: ___________  
**Browser**: ___________  
**Environment**: ___________

### Observations:
```
[To be filled during test execution]

Maximum allowed quantity: ___
Decimal handling behavior: ___
```

---

## Pass/Fail Criteria

**Pass**: 
- All quantity increase operations work correctly
- UI updates immediately
- Cart synchronizes properly
- Invalid inputs handled gracefully
- No console errors

**Fail**: 
- Quantity doesn't increase
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

- Test with various product types (simple, configurable, if applicable)
- Verify pricing updates correctly with quantity changes
- Check for any quantity limits per product
- Test with products that have stock limitations

---

## Screenshots/Evidence

[Attach screenshots or video recordings here]

1. Before quantity increase
2. After single + click
3. After multiple rapid clicks
4. Typing large quantity
5. Cart synchronization verification

