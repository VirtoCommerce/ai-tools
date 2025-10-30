# Test Cases for VCST-3918: [Product details] [Price and delivery widget] Remove "your" and add deliminator to totals

## User Story Details
- **Jira Key**: VCST-3918
- **Summary**: [Product details] [Price and delivery widget] Remove "your" and add deliminator to totals
- **Priority**: High
- **Status**: Done
- **Created**: 9/10/2025

## Description
This user story focuses on updating the Price and Delivery widget on the product details page by:
1. Removing the word "your" from text labels
2. Adding delimiters (thousands separators) to total price values for better readability

---

## Test Cases

### Test Case 1: Verify Removal of "your" Text from Price and Delivery Widget Labels
**Objective**: Confirm that the word "your" has been removed from all text labels in the Price and Delivery widget on the product details page

**Preconditions**:
- Access to the Virto Commerce storefront (https://docs.virtocommerce.org/platform/user-guide/)
- At least one product with pricing information exists in the catalog
- User is logged in (if authentication is required)
- Navigate to product details page (https://docs.virtocommerce.org/products/catalog/)

**Test Steps**:
1. Navigate to any product details page
2. Locate the Price and Delivery widget on the page
3. Review all text labels within the widget (e.g., "Your Total", "Your Price", "Your Subtotal")
4. Verify that the word "your" does not appear before any pricing labels
5. Check multiple products with different price ranges to ensure consistency

**Expected Results**:
- The word "your" should be completely removed from all labels in the Price and Delivery widget
- Labels should display as "Total", "Price", "Subtotal" instead of "Your Total", "Your Price", "Your Subtotal"
- Text changes are consistent across all product detail pages
- No grammatical errors or formatting issues introduced by the text removal

**Test Data**: 
- Product SKU: Any available product in catalog
- Multiple products with varying price points (low, medium, high)

**Priority**: High

---

### Test Case 2: Verify Delimiter Formatting for Prices Below 1,000
**Objective**: Validate that prices under 1,000 display correctly without delimiters but maintain proper decimal formatting

**Preconditions**:
- Access to the Virto Commerce storefront
- Products with prices less than 1,000 in various currencies exist in the catalog (https://docs.virtocommerce.org/products/pricing/)
- Pricing module is properly configured

**Test Steps**:
1. Navigate to a product details page with a price less than 1,000 (e.g., $99.99, $500.00, $999.99)
2. Locate the Price and Delivery widget
3. Observe the total price formatting
4. Verify decimal separator is present (e.g., "." or "," depending on locale)
5. Confirm no thousands delimiter appears (as it's not needed)
6. Repeat for products in different currencies

**Expected Results**:
- Prices below 1,000 display without thousands delimiter
- Decimal separator displays correctly based on locale settings
- Format examples: $99.99, $500.00, $999.99 (no comma)
- Currency symbol displays correctly
- Price values are accurate and match configured product pricing

**Test Data**: 
- Product with price: $99.99
- Product with price: $500.00
- Product with price: $999.99

**Priority**: High

---

### Test Case 3: Verify Delimiter Formatting for Prices Above 1,000
**Objective**: Confirm that prices of 1,000 and above display with proper thousands delimiter formatting

**Preconditions**:
- Access to the Virto Commerce storefront
- Products with prices of 1,000 or more exist in the catalog (https://docs.virtocommerce.org/products/pricing/)
- Regional/locale settings configured for delimiter format

**Test Steps**:
1. Navigate to a product details page with a price of 1,000 or more (e.g., $1,500.00, $10,250.99, $100,000.00)
2. Locate the Price and Delivery widget
3. Verify the thousands delimiter appears correctly (comma in US locale: 1,000 or period in EU locale: 1.000)
4. Check that decimal separator is correctly positioned
5. Verify multiple levels of delimiters for larger numbers (e.g., $1,000,000.00 displays as "1,000,000.00")
6. Test with different currency formats

**Expected Results**:
- Thousands delimiter displays correctly based on locale settings
- US locale example: $1,500.00, $10,250.99, $100,000.00
- EU locale example: €1.500,00, €10.250,99, €100.000,00
- Delimiters appear at correct intervals (every three digits from right)
- Decimal values remain intact and properly formatted
- Total calculations include delimiters where applicable

**Test Data**: 
- Product with price: $1,000.00
- Product with price: $10,250.99
- Product with price: $100,000.00
- Product with price: $1,000,000.00

**Priority**: High

---

### Test Case 4: Verify Delimiter Formatting in Multi-Currency Scenarios
**Objective**: Ensure delimiter formatting works correctly when switching between different currencies with various formatting conventions

**Preconditions**:
- Multi-currency support enabled (https://docs.virtocommerce.org/platform/user-guide/)
- At least 3 different currencies configured (e.g., USD, EUR, JPY)
- Products with prices defined in multiple currencies
- User has ability to switch currency on storefront

**Test Steps**:
1. Navigate to a product details page with price above 1,000
2. Note the default currency and delimiter format in the Price and Delivery widget
3. Switch to USD currency and verify format: $1,000.00
4. Switch to EUR currency and verify format based on locale settings
5. Switch to JPY currency and verify format: ¥1,000 (no decimal for JPY)
6. Verify that "your" text is removed in all currency displays
7. Check for any formatting inconsistencies or errors during currency switching

**Expected Results**:
- Delimiters display correctly according to each currency's locale convention
- USD: comma as thousands separator, period as decimal (1,000.00)
- EUR: period or space as thousands separator based on locale (1.000,00 or 1 000,00)
- JPY: comma as thousands separator, no decimals (1,000)
- Currency symbols display correctly for each currency
- The word "your" remains removed across all currency formats
- No JavaScript errors or formatting glitches during currency switching

**Test Data**: 
- Product price: $1,500.00 USD / €1,400.00 EUR / ¥165,000 JPY
- Multiple currency configurations

**Priority**: Medium

---

### Test Case 5: Verify Delimiter Formatting with Quantity Changes and Subtotals
**Objective**: Validate that delimiters are correctly applied to calculated totals when product quantity is changed

**Preconditions**:
- Access to the Virto Commerce storefront
- Product with configurable quantity available (https://docs.virtocommerce.org/products/catalog/)
- Product base price results in total over 1,000 when quantity is increased
- Price and Delivery widget displays subtotal calculations

**Test Steps**:
1. Navigate to a product details page with price around $500.00
2. Locate the quantity selector in the Price and Delivery widget
3. Set quantity to 1 and verify price displays as $500.00 (no delimiter)
4. Increase quantity to 3 (total: $1,500.00)
5. Verify the total now displays with delimiter: $1,500.00
6. Increase quantity to 100 (total: $50,000.00)
7. Verify delimiter formatting for larger total: $50,000.00
8. Decrease quantity back to 1 and verify delimiter is removed
9. Check that "your" text is not present in any subtotal or total labels

**Expected Results**:
- Delimiters dynamically appear when calculated total reaches 1,000 or above
- Delimiters are removed when total falls below 1,000
- Calculations are accurate for all quantity levels
- Format updates in real-time as quantity changes
- No "your" text appears in labels like "Subtotal", "Total", or "Price"
- No formatting errors or delays in delimiter application
- Proper delimiter placement for all calculated values (e.g., $50,000.00)

**Test Data**: 
- Product base price: $500.00
- Quantity variations: 1, 3, 10, 100

**Priority**: High

---

## Edge Cases and Negative Tests

### Test Case 6: Verify Delimiter Formatting for Edge Case Prices (Boundary Values)
**Objective**: Test delimiter behavior at boundary values (999.99, 1,000.00, 1,000.01)

**Preconditions**:
- Access to products with specific pricing at boundary values
- Admin access to create test products if needed (https://docs.virtocommerce.org/products/catalog/)

**Test Steps**:
1. Navigate to product with price $999.99
2. Verify no delimiter appears: $999.99
3. Navigate to product with price $1,000.00
4. Verify delimiter appears: $1,000.00
5. Navigate to product with price $1,000.01
6. Verify delimiter appears: $1,000.01
7. Test with negative prices (if applicable, e.g., discounts): -$1,000.00
8. Verify "your" text is absent in all scenarios

**Expected Results**:
- $999.99 displays without delimiter
- $1,000.00 displays with delimiter as "1,000.00"
- $1,000.01 displays with delimiter as "1,000.01"
- Boundary transition is exact and consistent
- Negative values (if supported) display delimiters correctly: -$1,000.00
- No formatting glitches at boundary values

**Test Data**: 
- Prices: $999.99, $1,000.00, $1,000.01, -$1,000.00

**Priority**: Medium

---

## Notes
- **Browser Compatibility**: Test delimiter formatting across major browsers (Chrome, Firefox, Safari, Edge) to ensure consistent rendering
- **Mobile Responsive**: Verify that delimiter formatting and text changes display correctly on mobile devices and tablets
- **Locale Settings**: Delimiter format may vary based on regional settings - test with multiple locale configurations
- **Performance**: Ensure that dynamic delimiter formatting (especially with quantity changes) doesn't cause performance degradation
- **Accessibility**: Verify that screen readers properly announce prices with delimiters
- **Related Documentation**: 
  - Product Catalog: https://docs.virtocommerce.org/products/catalog/
  - Pricing Configuration: https://docs.virtocommerce.org/products/pricing/
- **Dependencies**: This story may be related to UI/UX improvements in the storefront theme
- **Regression Testing**: Verify that existing pricing calculation functionality remains intact after these cosmetic changes