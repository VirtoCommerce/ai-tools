# Test Cases for VCST-3927: [E2E] Improve performance of Add to Cart Operations on Category and Product Pages

## User Story Details
- **Jira Key**: VCST-3927
- **Summary**: [E2E] Improve performance of Add to Cart Operations on Category and Product Pages
- **Priority**: Medium
- **Status**: Cancelled
- **Created**: 9/11/2025

## Description
The following steps should help improve the performance of cart operations to be less than 300ms on Virto Start. The cart validation should be skipped if the Cart operation doesn't query validationErrors, and Frontend mutation AddItem and ChangeQuantity should query id, itemsQuantity only.

---

## Test Cases

### Test Case 1: Verify Add to Cart Performance on Category Page
**Objective**: Verify that adding items to cart from category page completes within 300ms

**Preconditions**:
- Store is configured and running ([Store setup guide](https://docs.virtocommerce.org/new-topic/setup-storefront/))
- Test products are available in the catalog ([Catalog management](https://docs.virtocommerce.org/user-guide/catalog-management/))
- Performance monitoring tools are configured

**Test Steps**:
1. Navigate to any category page
2. Click "Add to Cart" for a product
3. Measure the operation execution time
4. Verify cart updated with correct quantity

**Expected Results**:
- Operation completes in less than 300ms
- Cart updates successfully
- Only id and itemsQuantity are queried in the response

**Test Data**: 
- Standard catalog products
- Performance metrics baseline

**Priority**: High

---

### Test Case 2: Verify Cart Performance Without Validation Errors Query
**Objective**: Confirm improved performance when validation errors are not queried

**Preconditions**:
- Cart module is configured ([Cart module documentation](https://docs.virtocommerce.org/user-guide/cart-management/))
- Test products available in catalog

**Test Steps**:
1. Execute AddItem mutation without validationErrors query
2. Measure operation execution time
3. Compare with baseline (with validation)
4. Verify cart contents

**Expected Results**:
- Operation executes faster than with validation
- Cart updates correctly
- No validation errors are processed

**Priority**: High

---

### Test Case 3: Verify Change Quantity Performance
**Objective**: Test performance of quantity changes in cart

**Preconditions**:
- Cart contains items ([Shopping cart API](https://docs.virtocommerce.org/api-reference/storefront-api/shopping-cart/))
- Test products available

**Test Steps**:
1. Update quantity of existing cart item
2. Measure operation execution time
3. Verify response contains only id and itemsQuantity
4. Check cart total update

**Expected Results**:
- Quantity update completes within 300ms
- Response contains minimal required fields
- Cart totals update correctly

**Priority**: Medium

---

### Test Case 4: Multiple Items Addition Performance
**Objective**: Verify performance when adding multiple items simultaneously

**Preconditions**:
- Empty cart
- Multiple test products available

**Test Steps**:
1. Add multiple items to cart in quick succession
2. Measure each operation time
3. Monitor overall performance impact
4. Verify cart state

**Expected Results**:
- Each operation completes within 300ms
- Cart maintains consistency
- No performance degradation with multiple operations

**Priority**: Medium

---

### Test Case 5: Edge Case - Maximum Cart Items
**Objective**: Test performance with maximum allowed cart items

**Preconditions**:
- Cart configured with item limit
- Sufficient test products available

**Test Steps**:
1. Add items until reaching cart limit
2. Attempt to add one more item
3. Measure operation times
4. Verify error handling

**Expected Results**:
- Operations maintain sub-300ms performance
- Appropriate error message when limit reached
- Cart remains stable

**Priority**: Low

---

### Test Case 6: Negative Test - Invalid Product Addition
**Objective**: Verify performance with invalid product additions

**Test Steps**:
1. Attempt to add non-existent product
2. Attempt to add product with invalid quantity
3. Measure error response time
4. Verify cart state

**Expected Results**:
- Error responses return within 300ms
- Cart remains unchanged
- Proper error handling without validation query

**Priority**: Medium

---

## Notes
- All performance measurements should be conducted under consistent network conditions
- Tests should be run during both peak and off-peak hours
- Consider implementing automated performance monitoring
- Related documentation: [Performance optimization guide](https://docs.virtocommerce.org/user-guide/performance-optimization/)

Dependencies:
- Cart module configuration
- Product catalog setup
- Performance monitoring tools