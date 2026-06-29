# Test Cases for VCST-3918: [Product details] [Price and delivery widget] Remove "your" and add deliminator to totals

## User Story Details
- **Jira Key**: VCST-3918
- **Summary**: [Product details] [Price and delivery widget] Remove "your" and add deliminator to totals
- **Priority**: High
- **Status**: Done
- **Created**: 9/10/2025

## Description
No description provided

---

## Test Cases

### Test Case 1: Verify Price Widget Text Formatting - Basic Product
**Objective**: Verify that "your" prefix is removed and total values have proper delimiters in the price widget

**Preconditions**:
- Store is configured and running
- Test product exists in catalog with defined price
- User is logged in to storefront
- Reference: [Catalog Management](https://docs.virtocommerce.org/user_guide/catalog-management/)

**Test Steps**:
1. Navigate to product details page
2. Locate price and delivery widget
3. Verify price display format
4. Check total amount format

**Expected Results**:
- Text should not contain "your" prefix before price/total amounts
- Numerical values should include proper thousand separators (e.g., 1,000.00)
- Currency symbol is properly displayed

**Test Data**: 
- Product with price > 1000 (e.g., $1,499.99)

**Priority**: High

---

### Test Case 2: Verify Price Widget Formatting - Multiple Items
**Objective**: Check formatting when multiple items are added to cart

**Preconditions**:
- Store is configured with shopping cart enabled
- Multiple products available
- Reference: [Shopping Cart](https://docs.virtocommerce.org/user_guide/shopping-cart/)

**Test Steps**:
1. Add multiple items to cart
2. View product details for an item
3. Check subtotal formatting
4. Verify total amount formatting with quantity changes

**Expected Results**:
- No "your" prefix in any price display
- All numerical values over 999 have thousand separators
- Subtotal and total calculations maintain proper formatting

**Priority**: High

---

### Test Case 3: Price Widget Formatting - Different Currencies
**Objective**: Verify formatting consistency across different currency displays

**Preconditions**:
- Store configured with multiple currencies
- Products with prices in different currencies
- Reference: [Price Management](https://docs.virtocommerce.org/user_guide/price-management/)

**Test Steps**:
1. Switch between different currencies
2. Check price widget formatting for each currency
3. Verify delimiter consistency across currencies

**Expected Results**:
- Correct thousand separator for each currency format
- No "your" prefix in any currency display
- Proper currency symbol placement

**Priority**: Medium

---

### Test Case 4: Price Widget - Edge Case Large Numbers
**Objective**: Verify formatting for very large price values

**Preconditions**:
- Product configured with high-value price (>1,000,000)
- Reference: [Product Management](https://docs.virtocommerce.org/user_guide/product-management/)

**Test Steps**:
1. Navigate to high-value product
2. Check price widget display
3. Verify delimiter placement in large numbers

**Expected Results**:
- Correct thousand separators for large numbers (e.g., 1,000,000.00)
- No formatting overflow or display issues
- Consistent alignment of numbers

**Priority**: Medium

---

### Test Case 5: Price Widget - Decimal Values
**Objective**: Verify formatting for prices with various decimal places

**Test Steps**:
1. Check products with different decimal places
2. Verify consistency of decimal separator
3. Test different price variations

**Expected Results**:
- Consistent decimal place display
- Proper alignment of decimal numbers
- No "your" prefix in any variation

**Test Data**: 
- Prices: 99.99, 99.90, 99.00

**Priority**: Medium

---

### Test Case 6: Negative Test - Special Characters
**Objective**: Verify widget handling of special characters in price display

**Test Steps**:
1. Attempt to set prices with special characters
2. Check price widget rendering
3. Verify error handling

**Expected Results**:
- Proper handling of invalid input
- Clean display without formatting issues
- Appropriate error messages if applicable

**Priority**: Low

---

## Notes
- All currency formats should follow locale-specific conventions
- Verify responsive design behavior of price widget
- Check accessibility requirements for price display
- Related to price display components across the platform

## Dependencies
- Currency configuration
- Product catalog setup
- Store locale settings

The test cases focus on ensuring consistent formatting and removal of the "your" prefix while maintaining proper thousand separators across different scenarios and edge cases.