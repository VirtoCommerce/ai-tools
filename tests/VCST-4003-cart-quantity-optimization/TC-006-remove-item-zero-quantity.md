# TC-006: Remove Item via Zero Quantity

## Test Case Information

**Test Case ID**: TC-006  
**Test Case Title**: Verify Item Removal When Quantity Set to Zero  
**Related Story**: [VCST-4003](https://virtocommerce.atlassian.net/browse/VCST-4003)  
**Priority**: High  
**Test Type**: Functional  
**Estimated Time**: 10 minutes

---

## Description

Verify that setting a product's quantity to 0 (zero) removes the item from the cart. This can be done by clicking the "-" button when quantity = 1, or by typing "0" directly into the quantity field.

**Requirement**: Per VCST-4003 acceptance criteria, "Setting quantity = 0 removes the item from the cart."

---

## Preconditions

1. User is logged into the VirtoCommerce platform
2. User has navigated to a category page with products
3. At least 2-3 products are in the cart
4. Browser DevTools Network tab is open for verification

---

## Test Data

- **Test User**: `test_user@example.com`
- **Products in Cart**: At least 3 products with quantity ≥ 1

---

## Test Steps

### Step 1: Verify Initial Cart State
1. Navigate to category page
2. Identify products currently in cart
3. Note the total cart count
4. Note the products and their quantities

**Expected Result**: Multiple products visible in cart, cart icon shows correct total

---

### Step 2: Remove Item by Clicking - Button When Quantity = 1
1. Locate a product with quantity = 1
2. Click the "-" button once
3. Observe immediate UI change
4. Wait 1 second for mutation to complete

**Expected Result**:
- Product immediately disappears from visible cart (optimistic update)
- OR quantity shows "0" briefly then removes
- Cart icon count decreases by 1
- GraphQL mutation sent with `quantity: 0` for that productId
- After mutation completes, product is no longer in cart

---

### Step 3: Verify Removal by Typing 0
1. Locate another product in cart with any quantity
2. Click into the quantity input field
3. Clear the field and type "0"
4. Press Enter or click outside field
5. Wait for mutation

**Expected Result**:
- Product removed from cart immediately (optimistic)
- Cart icon updated
- Mutation sent with `quantity: 0`
- Product no longer appears in cart after mutation completes

---

### Step 4: Remove Multiple Items Simultaneously
1. Have 3 products in cart
2. Within 1 second:
   - Set Product A quantity to 0 (type "0")
   - Click "-" on Product B (when quantity = 1)
   - Type "0" for Product C
3. Wait for batched mutation

**Expected Result**:
- All three products removed optimistically
- Single mutation sent with all three products having `quantity: 0`
- Cart becomes empty or shows remaining items
- Cart icon shows correct remaining count

---

### Step 5: Verify Cart Synchronization After Removal
1. Remove a product by setting quantity to 0
2. Navigate to cart page
3. Verify product is not in cart
4. Return to category page
5. Verify product no longer shows as "in cart"

**Expected Result**:
- Product completely removed from cart across all views
- Cart page doesn't show removed product
- Category page reflects removal
- No ghost entries

---

### Step 6: Remove Last Item in Cart
1. Ensure cart has only 1 product remaining
2. Set that product's quantity to 0
3. Observe cart state

**Expected Result**:
- Product removed
- Cart becomes empty
- Cart icon shows "0" or empty state
- Mini-cart shows "Your cart is empty" message
- No errors

---

### Step 7: Verify Mutation Payload for Removal
1. Open DevTools Network tab
2. Remove a product by setting quantity to 0
3. Inspect the GraphQL mutation request
4. Verify payload structure

**Expected Result**:
- Mutation includes: `{ productId: "XXX", quantity: 0 }`
- Request is valid GraphQL format
- Response confirms removal
- No errors in response

---

### Step 8: Remove and Re-add Product
1. Remove a product (set quantity to 0)
2. Wait for mutation to complete
3. Click "+" or "Add to Cart" for the same product
4. Verify product is re-added with quantity = 1

**Expected Result**:
- Product successfully removed
- Product can be re-added
- New mutation sent to add product
- No conflicts or errors

---

### Step 9: Test Undo/Revert (if applicable)
1. Remove a product (quantity = 0)
2. If there's an "Undo" option, click it immediately
3. Observe behavior

**Expected Result**:
- If undo is available: Product is restored
- If no undo: Product remains removed
- UI handles this gracefully

---

### Step 10: Edge Case - Rapid Remove and Re-add
1. Set product quantity to 0
2. Immediately (before mutation completes) click "+" to re-add
3. Observe queuing behavior

**Expected Result**:
- First mutation (remove) is queued/sent
- Second action (add) is queued
- Both processed in order
- Final state reflects latest action (product in cart with quantity = 1)
- No data conflicts

---

## Expected Results Summary

✅ **Remove via - Button**: Clicking "-" at quantity=1 removes item  
✅ **Remove via Typing 0**: Typing "0" removes item  
✅ **Optimistic Removal**: Item disappears immediately from UI  
✅ **Mutation Payload**: Mutation includes `quantity: 0`  
✅ **Cart Sync**: Removal reflected across all cart views  
✅ **Empty Cart**: Can empty cart completely  
✅ **Re-add Works**: Can re-add removed products  
✅ **Batch Removal**: Can remove multiple items simultaneously

---

## Actual Results

**Execution Date**: ___________  
**Executed By**: ___________  
**Browser**: ___________  
**Environment**: ___________

### Observations:
```
[To be filled during test execution]

Remove behavior (immediate/delayed): ___
Empty cart message displayed: Yes/No
Re-add functionality works: Yes/No
```

---

## Pass/Fail Criteria

**Pass**: 
- Setting quantity to 0 removes item from cart
- Removal works via both - button and typing
- UI updates optimistically
- Mutation sent with quantity: 0
- Cart synchronizes correctly
- Can re-add removed products

**Fail**: 
- Quantity 0 doesn't remove item
- Item remains in cart after removal
- Mutation fails or has wrong payload
- Cannot re-add removed items
- UI shows inconsistent state

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

- This is a critical test case as per VCST-4003 requirements
- Verify no orphaned cart entries in database
- Check for proper cleanup of cart-related data
- Test with products that have special pricing or promotions
- Verify analytics tracking for removed items (if applicable)

---

## Screenshots/Evidence

[Attach screenshots or video recordings here]

1. Before removal (product in cart)
2. Immediately after setting quantity to 0 (optimistic update)
3. After mutation completes (product gone)
4. Empty cart state
5. GraphQL mutation payload showing quantity: 0
6. Product successfully re-added

