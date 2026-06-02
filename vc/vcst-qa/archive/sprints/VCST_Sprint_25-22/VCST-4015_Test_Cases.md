# Test Cases for VCST-4015: Refactor useCart. getItemsTotal from The Platform

## User Story Details
- **Jira Key**: VCST-4015
- **Summary**: Refactor useCart. getItemsTotal from The Platform
- **Priority**: Medium
- **Status**: Cancelled
- **Created**: 9/26/2025

## Description
Replace sumBy(filteredItems, (x) => x.extendedPrice.amount); from the platform value
SEE LINKED TASK! (has been implemented but then reverted)

---

## Test Cases

### Test Case 1: Verify Basic Cart Total Calculation
**Objective**: Verify that the new implementation correctly calculates total for cart items with standard prices

**Preconditions**:
- Cart contains multiple items
- All items have valid extendedPrice.amount values

**Test Steps**:
1. Initialize cart with multiple items
2. Call getItemsTotal() function
3. Compare result with manual calculation

**Expected Results**:
- Total matches sum of all items' extendedPrice.amount
- Performance is equal or better than previous implementation

**Test Data**:
```javascript
items = [
  {extendedPrice: {amount: 10.00}},
  {extendedPrice: {amount: 20.00}},
  {extendedPrice: {amount: 30.00}}
]
Expected total: 60.00
```

**Priority**: High

---

### Test Case 2: Handle Empty Cart
**Objective**: Verify proper handling of empty cart scenario

**Preconditions**:
- Cart is empty
- No filtered items exist

**Test Steps**:
1. Initialize empty cart
2. Call getItemsTotal()
3. Verify returned value

**Expected Results**:
- Returns 0 or appropriate default value
- No errors thrown

**Priority**: Medium

---

### Test Case 3: Handle Decimal Precision
**Objective**: Verify accurate calculation with decimal values

**Preconditions**:
- Cart contains items with decimal prices
- Multiple decimal places present

**Test Steps**:
1. Add items with various decimal prices
2. Call getItemsTotal()
3. Verify precision of result

**Expected Results**:
- Maintains correct decimal precision
- No rounding errors occur
- Matches previous implementation's precision

**Test Data**:
```javascript
items = [
  {extendedPrice: {amount: 10.99}},
  {extendedPrice: {amount: 20.45}},
  {extendedPrice: {amount: 30.67}}
]
```

**Priority**: High

---

### Test Case 4: Performance Test
**Objective**: Verify performance of new implementation versus old

**Preconditions**:
- Large dataset available (1000+ items)
- Performance measuring tools ready

**Test Steps**:
1. Prepare large cart dataset
2. Measure execution time of new implementation
3. Compare with previous implementation
4. Test with varying cart sizes

**Expected Results**:
- New implementation performs equal or better
- No significant performance degradation
- Consistent performance across different cart sizes

**Priority**: Medium

---

### Test Case 5: Handle Invalid Price Data
**Objective**: Verify proper handling of invalid price values

**Preconditions**:
- Cart contains items with various invalid price formats

**Test Steps**:
1. Test with null prices
2. Test with undefined prices
3. Test with NaN values
4. Test with negative values

**Expected Results**:
- Graceful error handling
- Appropriate error messages
- No calculation crashes

**Test Data**:
```javascript
items = [
  {extendedPrice: {amount: null}},
  {extendedPrice: {amount: undefined}},
  {extendedPrice: {amount: -10.00}},
  {extendedPrice: {amount: "invalid"}}
]
```

**Priority**: High

---

### Test Case 6: Currency Consistency
**Objective**: Verify handling of different currency formats

**Preconditions**:
- Cart contains items with different currency formats

**Test Steps**:
1. Add items with different currency notations
2. Verify currency handling
3. Check total calculation accuracy

**Expected Results**:
- Consistent currency handling
- Proper conversion if applicable
- Correct total calculation

**Priority**: Medium

---

## Edge Cases and Negative Tests

### Test Case 7: Maximum Value Handling
**Objective**: Verify handling of maximum possible values

**Preconditions**:
- Cart contains items with very large prices

**Test Steps**:
1. Add items with maximum possible values
2. Verify calculation handling
3. Check for overflow conditions

**Expected Results**:
- Proper handling of large numbers
- No overflow errors
- Accurate calculations maintained

**Priority**: Low

---

### Test Case 8: Integration with Cart Updates
**Objective**: Verify total updates correctly with cart modifications

**Test Steps**:
1. Add items to cart
2. Modify existing items
3. Remove items
4. Verify total updates

**Expected Results**:
- Total updates correctly with each modification
- Real-time calculation accuracy
- No stale data issues

**Priority**: High

---

## Notes
- Ensure backwards compatibility with existing cart functionality
- Verify integration with dependent components
- Performance testing should include various cart sizes
- Consider adding logging for debugging purposes
- Document any changes in calculation behavior