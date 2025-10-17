# TC-007: Cart Icon and Mini-Cart Synchronization

## Test Case Information

**Test Case ID**: TC-007  
**Test Case Title**: Verify Cart Icon and Mini-Cart Synchronization  
**Related Story**: [VCST-4003](https://virtocommerce.atlassian.net/browse/VCST-4003)  
**Priority**: High  
**Test Type**: Functional  
**Estimated Time**: 10 minutes

---

## Description

Verify that the cart icon/badge and mini-cart (cart dropdown) immediately reflect quantity changes made on the category page. This includes updating the total item count, displaying correct quantities, and showing accurate cart totals.

**Requirement**: Per VCST-4003, "The cart icon/mini-cart reflects the change right away."

---

## Preconditions

1. User is logged into the VirtoCommerce platform
2. User has navigated to a category page with products
3. Cart has 2-3 products with various quantities
4. Cart icon/badge is visible in the header
5. Mini-cart is accessible (hover or click on cart icon)

---

## Test Data

- **Test User**: `test_user@example.com`
- **Products in Cart**: 3 products with quantities: 2, 3, 5 (total = 10 items)

---

## Test Steps

### Step 1: Verify Initial Cart Icon State
1. Navigate to category page
2. Locate the cart icon in the header
3. Note the cart badge count
4. Calculate expected total (sum of all product quantities)

**Expected Result**: Cart icon badge shows "10" (or total item count)

---

### Step 2: Increase Quantity and Verify Cart Icon
1. Increase quantity of a product by 1 (click +)
2. **Immediately observe** the cart icon (within 50ms)
3. Verify badge count updates

**Expected Result**:
- Cart icon badge updates immediately from "10" to "11"
- No delay waiting for server response
- Badge animation (if any) plays smoothly

---

### Step 3: Decrease Quantity and Verify Cart Icon
1. Decrease quantity of a product by 1 (click -)
2. **Immediately observe** the cart icon
3. Verify badge count updates

**Expected Result**:
- Cart icon badge updates immediately from "11" to "10"
- Optimistic update, no server wait

---

### Step 4: Remove Item (Quantity = 0) and Verify Cart Icon
1. Set a product quantity to 0 (product had quantity = 2)
2. Observe cart icon immediately
3. Verify badge count decreases by 2

**Expected Result**:
- Cart icon badge updates from "10" to "8" immediately
- Reflects the removal of 2 items

---

### Step 5: Open Mini-Cart After Changes
1. Make a quantity change on category page
2. Immediately hover/click to open mini-cart
3. Verify mini-cart contents

**Expected Result**:
- Mini-cart shows updated quantity immediately
- Product quantities match category page changes
- Cart subtotal is recalculated (may show loading if mutation pending)

---

### Step 6: Multiple Rapid Changes - Cart Icon Tracking
1. Make 5 rapid quantity changes:
   - Product A: +1
   - Product B: +2
   - Product C: -1
   - Product A: +1 again
   - Product D: Add to cart (+1)
2. Observe cart icon after each action

**Expected Result**:
- Cart icon updates after each click
- Final badge count: 8 + 1 + 2 - 1 + 1 + 1 = 12
- All changes reflected optimistically

---

### Step 7: Verify Mini-Cart Product List
1. Open mini-cart
2. Verify each product shows correct quantity
3. Verify quantities match those on category page
4. Check that removed products are not shown

**Expected Result**:
- All products in mini-cart have correct quantities
- Removed products don't appear
- Quantities match category page exactly
- Product details (name, price, image) are correct

---

### Step 8: Verify Cart Subtotal Calculation
1. Make quantity changes on category page
2. Open mini-cart
3. Verify subtotal calculation

**Expected Result**:
- Subtotal = Sum of (product price × quantity) for all items
- Subtotal updates after mutation completes
- May show loading indicator during mutation
- Final subtotal is accurate

---

### Step 9: Empty Cart and Verify Icon
1. Remove all products from cart (set all quantities to 0)
2. Observe cart icon
3. Open mini-cart

**Expected Result**:
- Cart icon shows "0" or empty state
- Mini-cart shows "Your cart is empty" message
- No products listed in mini-cart

---

### Step 10: Cross-Page Synchronization
1. Make changes on category page A
2. Navigate to category page B (without refresh)
3. Verify cart icon still shows correct count
4. Open mini-cart and verify contents

**Expected Result**:
- Cart icon count persists across page navigation
- Mini-cart reflects all changes made on previous page
- No loss of cart state

---

### Step 11: Refresh and Verify Persistence
1. Make quantity changes on category page
2. Wait for mutation to complete
3. Refresh the page (F5)
4. Check cart icon badge

**Expected Result**:
- After refresh, cart icon shows persisted quantities
- All changes are saved
- Badge count matches server state

---

### Step 12: Concurrent Updates - Real-time Sync
1. (If possible) Open same site in two browser windows
2. Make quantity changes in Window 1
3. Observe cart icon in Window 2 (if real-time sync is implemented)

**Expected Result**:
- If real-time sync: Window 2 cart updates
- If no real-time sync: Window 2 updates after refresh
- No data conflicts or errors

---

## Expected Results Summary

✅ **Immediate Icon Update**: Cart icon badge updates instantly (<50ms)  
✅ **Accurate Count**: Badge shows correct total item count  
✅ **Mini-Cart Sync**: Mini-cart displays updated quantities  
✅ **Subtotal Accuracy**: Cart subtotal calculated correctly  
✅ **Empty State**: Proper handling when cart is empty  
✅ **Persistence**: Changes persist after page refresh  
✅ **Cross-Page**: Cart state maintained across navigation  
✅ **Removal Tracking**: Removed items don't appear in mini-cart

---

## Actual Results

**Execution Date**: ___________  
**Executed By**: ___________  
**Browser**: ___________  
**Environment**: ___________

### Observations:
```
[To be filled during test execution]

Cart icon update time: ___ ms
Mini-cart sync verified: Yes/No
Subtotal calculation accurate: Yes/No
Empty cart message shown: Yes/No
```

---

## Pass/Fail Criteria

**Pass**: 
- Cart icon badge updates immediately (<100ms)
- Badge count is always accurate
- Mini-cart shows correct quantities and products
- Subtotal calculates correctly
- Empty cart state handled properly
- Changes persist after refresh

**Fail**: 
- Cart icon doesn't update immediately
- Badge count is incorrect
- Mini-cart shows stale data
- Subtotal calculation wrong
- Cart state lost after navigation
- UI inconsistencies

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

- This is a critical UX test - cart icon is primary indicator of cart state
- Pay attention to any animation/transition on badge update
- Verify accessibility (screen readers announce count changes)
- Test with very large quantities (999+) to ensure badge doesn't break UI
- Check if mini-cart has scrolling for many items

---

## Screenshots/Evidence

[Attach screenshots or video recordings here]

1. Cart icon before quantity change
2. Cart icon immediately after change (showing update)
3. Mini-cart with updated quantities
4. Empty cart state
5. Cart icon with large quantity count

