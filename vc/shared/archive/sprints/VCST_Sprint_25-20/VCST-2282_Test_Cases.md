# Test Cases for VCST-2282: [Front] Tasks to do and plan

## User Story Details
- **Jira Key**: VCST-2282
- **Summary**: [Front] Tasks to do and plan
- **Priority**: Medium
- **Status**: On hold
- **Created**: 11/19/2024

## Description
Homepage → Search bar #2286
Catalog → Filters #2390 DONE
Order history → Filters #2390 DONE
Compare → Product card
Organization members → Filters #2390 DONE
Order history 
Pack size info ticket  
Search  
+- for variations

---

## Test Cases

### Test Case 1: Verify Homepage Search Bar Functionality with Basic Product Search
**Objective**: Validate that the search bar on the homepage correctly searches and displays products based on user input.

**Preconditions**:
- User has access to the Virto Commerce storefront
- Catalog contains searchable products with various attributes
- Search functionality is enabled in the store settings
- Reference: https://docs.virtocommerce.org/platform/user-guide/catalog/

**Test Steps**:
1. Navigate to the storefront homepage
2. Locate the search bar component (#2286)
3. Enter a valid product name (e.g., "laptop") in the search field
4. Press Enter or click the search icon
5. Verify the search results page loads
6. Check that products matching the search term are displayed
7. Verify product cards show: product image, name, price, and availability status

**Expected Results**:
- Search bar is visible and accessible on the homepage
- Search executes successfully without errors
- Search results page displays relevant products matching the query
- Product information is displayed correctly on each product card
- Search relevance ranking shows most appropriate products first
- No console errors or broken UI elements

**Test Data**: 
- Search term: "laptop"
- Expected minimum results: 3+ products

**Priority**: High

---

### Test Case 2: Verify Product Comparison with Product Card Display
**Objective**: Ensure that products can be added to comparison and product cards display correctly in the Compare view.

**Preconditions**:
- User is logged into the storefront
- Multiple products exist in the same category for comparison
- Compare functionality is enabled
- Reference: https://docs.virtocommerce.org/platform/user-guide/catalog/

**Test Steps**:
1. Navigate to a product category page (e.g., Electronics)
2. Select 2-3 products by clicking "Add to Compare" button on each product card
3. Verify compare counter/badge increases with each addition
4. Click on "Compare" link/button to navigate to comparison page
5. Verify all selected product cards are displayed in the Compare view
6. Check that product cards show: product image, name, SKU, price, key specifications
7. Verify the product card layout is consistent and responsive
8. Attempt to remove a product from comparison
9. Verify the product card is removed and comparison updates accordingly

**Expected Results**:
- Products are successfully added to comparison
- Compare counter accurately reflects number of products
- Compare page loads without errors
- Product cards display complete and accurate information
- Product cards maintain consistent styling and alignment
- Product specifications are aligned for easy comparison
- Remove functionality works correctly
- UI remains responsive on different screen sizes

**Test Data**: 
- Category: Electronics
- Products: 3 different laptop models from the catalog

**Priority**: High

---

### Test Case 3: Verify Product Variations with +/- Controls in Search Results
**Objective**: Test that product variations with quantity controls (+/-) function correctly when displayed in search results.

**Preconditions**:
- Catalog contains products with multiple variations (size, color, etc.)
- Products have stock availability configured
- User has permission to view and add products to cart
- Reference: https://docs.virtocommerce.org/platform/user-guide/catalog/

**Test Steps**:
1. Navigate to the homepage search bar
2. Search for a product that has variations (e.g., "t-shirt")
3. Select a product with variations from search results
4. Verify product variations are displayed (size, color options)
5. Select a specific variation
6. Locate the quantity +/- controls
7. Click the "+" button multiple times to increase quantity
8. Verify quantity increments correctly (1, 2, 3, etc.)
9. Click the "-" button to decrease quantity
10. Verify quantity decrements correctly
11. Attempt to decrease quantity below 1
12. Verify minimum quantity restriction (should not go below 1)
13. Add product with selected variation and quantity to cart

**Expected Results**:
- Product variations are clearly displayed and selectable
- +/- controls are visible and functional
- Quantity increases correctly with + button clicks
- Quantity decreases correctly with - button clicks
- Quantity cannot be reduced below minimum (1)
- Maximum quantity is enforced based on stock availability
- Selected variation and quantity are correctly added to cart
- Visual feedback is provided for quantity changes

**Test Data**: 
- Product: "T-shirt" with size variations (S, M, L, XL)
- Initial quantity: 1
- Test quantities: 1-10

**Priority**: High

---

### Test Case 4: Verify Pack Size Information Display and Functionality
**Objective**: Validate that pack size information is correctly displayed for products and properly integrated with ordering functionality.

**Preconditions**:
- Catalog contains products with pack size configurations
- Pack size information is configured in product properties
- User is logged in with appropriate permissions
- Reference: https://docs.virtocommerce.org/platform/user-guide/catalog/

**Test Steps**:
1. Navigate to a product that has pack size information (e.g., "Bottled Water - 24 pack")
2. Verify pack size information is displayed on the product card
3. Check that pack size details include: quantity per pack, unit measure
4. Navigate to the product detail page
5. Verify pack size information is also displayed on detail page
6. Add product to cart
7. Navigate to cart and verify pack size information is shown
8. Verify pricing reflects pack size (price per pack vs. unit price)
9. Proceed to checkout
10. Verify pack size information is maintained through order history

**Expected Results**:
- Pack size information is clearly visible on product cards
- Pack size details are accurate and complete
- Pack size info format is consistent across all pages (listing, detail, cart)
- Pricing correctly reflects pack size configuration
- Quantity controls work appropriately with pack sizes
- Order history reflects correct pack size information
- Pack size information is user-friendly and not confusing

**Test Data**: 
- Product: "Bottled Water - 24 pack"
- Pack size: 24 units
- Unit measure: bottles

**Priority**: Medium

---

### Test Case 5: Verify Advanced Search with Special Characters and Edge Cases
**Objective**: Test search functionality with edge cases including special characters, empty searches, and boundary conditions.

**Preconditions**:
- User has access to the storefront
- Search functionality is properly configured
- Test products with various naming conventions exist in catalog
- Reference: https://docs.virtocommerce.org/platform/user-guide/catalog/

**Test Steps**:
1. Navigate to homepage search bar
2. **Test Case 5a - Empty Search:**
   - Submit search with empty/blank input
   - Verify appropriate handling (error message or display all products)
3. **Test Case 5b - Special Characters:**
   - Enter special characters: @#$%^&*()
   - Verify search handles special characters gracefully
4. **Test Case 5c - Very Long Search String:**
   - Enter a search string with 200+ characters
   - Verify character limit enforcement or proper handling
5. **Test Case 5d - SQL Injection Attempt:**
   - Enter: `' OR '1'='1`
   - Verify search is sanitized and returns safe results
6. **Test Case 5e - XSS Attempt:**
   - Enter: `<script>alert('test')</script>`
   - Verify input is sanitized and no script execution occurs
7. **Test Case 5f - Search with Spaces:**
   - Enter multiple spaces before/after search term: "  laptop  "
   - Verify spaces are trimmed and search executes normally
8. **Test Case 5g - Case Sensitivity:**
   - Search with "LAPTOP", "laptop", "LaPtOp"
   - Verify search is case-insensitive and returns same results
9. **Test Case 5h - Non-existent Product:**
   - Search for: "xyzabc123notaproduct"
   - Verify "No results found" message displays appropriately

**Expected Results**:
- Empty searches are handled gracefully with clear user feedback
- Special characters don't break the search functionality
- Very long strings are truncated or character limit is enforced
- Security vulnerabilities (SQL injection, XSS) are prevented
- Input sanitization works correctly
- Search is case-insensitive by default
- Spaces are trimmed from search queries
- No results scenario displays user-friendly message with suggestions
- No system errors or crashes occur
- Search performance remains acceptable even with edge cases

**Test Data**: 
- Valid search: "laptop"
- Empty search: ""
- Special chars: "@#$%^&*()"
- Long string: 200+ character string
- Security tests: SQL injection and XSS strings
- Non-existent: "xyzabc123notaproduct"

**Priority**: High

---

## Edge Cases and Negative Tests

**Note**: Test Case 5 above covers the primary edge cases and negative scenarios for the search functionality. Additional specific edge cases for Compare and Pack Size features are embedded in their respective test cases.

---

## Notes
- **Dependencies**: 
  - Related stories: #2286 (Search bar), #2390 (Filters - marked as DONE)
  - Requires functional catalog with properly configured products
  - Requires working authentication system for logged-in user scenarios
  
- **Testing Environment Requirements**:
  - Test data should include products with variations, pack sizes, and various attributes
  - Multiple browsers should be tested (Chrome, Firefox, Safari, Edge)
  - Responsive design testing required for mobile and tablet views
  
- **Known Limitations**:
  - Story status is "On hold" - confirm with Product Owner before executing tests
  - Some features marked as DONE (#2390 filters) may need regression testing only
  
- **Additional Considerations**:
  - Performance testing recommended for search functionality with large catalogs
  - Accessibility testing (WCAG compliance) should be considered for all UI components
  - API-level testing may be needed for search and comparison backend services

- **Documentation References**:
  - Main Platform Documentation: https://docs.virtocommerce.org/
  - Catalog Management: https://docs.virtocommerce.org/platform/user-guide/catalog/
  - For specific API testing: https://docs.virtocommerce.org/platform/developer-guide/