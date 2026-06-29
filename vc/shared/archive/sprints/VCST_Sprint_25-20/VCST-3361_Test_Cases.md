# Test Cases for VCST-3361: [Design] [Search] Improved design and usability of search drop-down

## User Story Details
- **Jira Key**: VCST-3361
- **Summary**: [Design] [Search] Improved design and usability of search drop-down
- **Priority**: Medium
- **Status**: To do
- **Created**: 5/28/2025

## Description
As a user I want to see more modern and user-friendly search drop-down so I can easily add the relevant to my search products to cart.
If smth is not found (e.g. no pages) → do not show the section at all.
Add to cart → The product is added to cart
N variations → Open the variation page
Customize → Open the product page
Design (example):  
Mob:

---

## Test Cases

### Test Case 1: Verify Quick Add to Cart functionality for simple products in search dropdown
**Objective**: Verify that users can add simple products (without variations) directly to cart from the search dropdown using the "Add to cart" button

**Preconditions**:
- User is logged into the storefront (https://docs.virtocommerce.org/platform/user-guide/docs/introduction/)
- At least one simple product (product without variations) exists in the catalog with available inventory
- Shopping cart is accessible (https://docs.virtocommerce.org/products/products-cart-module/)
- Search functionality is properly configured

**Test Steps**:
1. Navigate to the storefront homepage
2. Click on the search bar in the header
3. Enter a search term that returns at least one simple product (e.g., "laptop case")
4. Wait for the search dropdown to appear with product results
5. Locate a simple product in the search results
6. Click the "Add to cart" button for that product
7. Verify the cart icon updates with the new item count
8. Navigate to the shopping cart page

**Expected Results**:
- Search dropdown displays relevant product results with modern, user-friendly design
- "Add to cart" button is clearly visible and clickable for simple products
- Product is successfully added to cart without page refresh
- Visual feedback is provided (cart icon badge updates, success notification appears)
- Cart page shows the product with correct quantity (1), price, and product details
- User remains on the same page after adding to cart

**Test Data**: 
- Search term: "laptop case"
- Product SKU: Simple product without variations

**Priority**: High

---

### Test Case 2: Verify "N variations" functionality opens product variation selection page
**Objective**: Verify that products with multiple variations display "N variations" link/button and clicking it navigates to the product variation selection page

**Preconditions**:
- User is on the storefront
- At least one product with multiple variations (e.g., different sizes, colors) exists in the catalog
- Product variations are properly configured (https://docs.virtocommerce.org/products/products-catalog-module/)

**Test Steps**:
1. Navigate to the storefront homepage
2. Click on the search bar
3. Enter a search term for a product known to have multiple variations (e.g., "t-shirt")
4. Wait for the search dropdown to display results
5. Locate a product with variations in the search results
6. Verify the "N variations" indicator is displayed (where N is the number of variations)
7. Click on the "N variations" link/button
8. Verify navigation to the product page

**Expected Results**:
- Products with variations display "N variations" text/button instead of "Add to cart"
- The number N accurately reflects the actual count of available variations
- Clicking "N variations" opens the full product page
- Product page displays all available variations with selection options (size, color, etc.)
- User can select specific variation and add to cart from the product page
- Search dropdown closes after navigation

**Test Data**: 
- Search term: "t-shirt"
- Product: Multi-variation product (e.g., 5 variations)

**Priority**: High

---

### Test Case 3: Verify "Customize" functionality for customizable products
**Objective**: Verify that customizable products display "Customize" button and clicking it opens the product detail page for customization

**Preconditions**:
- User is on the storefront
- At least one customizable product exists in the catalog (product requiring user input or customization options)
- Product is properly configured as customizable

**Test Steps**:
1. Navigate to the storefront homepage
2. Click on the search bar
3. Enter a search term for a customizable product (e.g., "custom mug", "personalized gift")
4. Wait for the search dropdown to populate with results
5. Locate a customizable product in the search results
6. Verify the "Customize" button is displayed for the product
7. Click the "Customize" button
8. Verify navigation to the product detail page
9. Verify customization options are visible and functional

**Expected Results**:
- Customizable products display "Customize" button instead of direct "Add to cart"
- "Customize" button is clearly labeled and visually distinct
- Clicking "Customize" navigates to the full product detail page
- Product detail page loads successfully with all customization options visible
- User can complete customization before adding to cart
- Search dropdown closes after navigation

**Test Data**: 
- Search term: "custom mug"
- Product: Customizable product requiring user input

**Priority**: Medium

---

### Test Case 4: Verify empty sections are hidden when no results found
**Objective**: Verify that search dropdown sections (Products, Pages, Categories, etc.) are completely hidden when no results are found for that section type

**Preconditions**:
- User is on the storefront
- Catalog contains products in multiple categories
- CMS pages exist in the system (https://docs.virtocommerce.org/platform/developer-guide/docs/Fundamentals/Stores/)

**Test Steps**:
1. Navigate to the storefront homepage
2. Click on the search bar
3. Enter a search term that returns products but no pages (e.g., specific product SKU)
4. Observe the search dropdown layout and sections displayed
5. Clear the search field
6. Enter a search term that returns no products but matches page content
7. Observe which sections are displayed
8. Clear the search field
9. Enter a completely random/non-existent search term (e.g., "xyzabc123nonexistent")
10. Observe the search dropdown

**Expected Results**:
- When no products found: "Products" section is not displayed at all
- When no pages found: "Pages" section is not displayed at all
- When no categories found: "Categories" section is not displayed at all
- Only sections with actual results are shown in the dropdown
- When no results found in any section: appropriate "No results found" message is displayed
- No empty sections with "0 results" or blank spaces are shown
- Dropdown maintains clean, modern appearance without empty sections

**Test Data**: 
- Test case 1: Product SKU (e.g., "PROD-12345")
- Test case 2: Page content keyword
- Test case 3: "xyzabc123nonexistent"

**Priority**: High

---

### Test Case 5: Verify search dropdown responsiveness and design on mobile devices
**Objective**: Verify that the search dropdown displays correctly and all functionality works properly on mobile devices with improved mobile-specific design

**Preconditions**:
- User accesses storefront via mobile device or mobile emulation mode
- Mobile-responsive design is implemented for search functionality
- Products with different action types (simple, variations, customizable) exist

**Test Steps**:
1. Open the storefront on a mobile device or in mobile emulation mode (viewport: 375x667 for iPhone)
2. Tap on the search bar/icon
3. Enter a search term that returns multiple products
4. Verify the search dropdown appearance and layout
5. Scroll through search results if multiple items are returned
6. Test "Add to cart" functionality by tapping the button for a simple product
7. Clear search and enter term for product with variations
8. Test "N variations" link by tapping on it
9. Return to search and test "Customize" button for customizable product
10. Verify dropdown closes properly when tapping outside the dropdown area
11. Test on different mobile screen sizes (small: 320px, medium: 375px, large: 414px)

**Expected Results**:
- Search dropdown renders properly on mobile viewport without horizontal scrolling
- Touch targets (buttons, links) are appropriately sized for mobile (minimum 44x44px)
- Product images scale correctly and maintain aspect ratio
- Text is readable without zooming (minimum 14px font size)
- "Add to cart", "N variations", and "Customize" buttons are easily tappable
- All functionality works the same as desktop version
- Dropdown scrolls smoothly if content exceeds viewport height
- Dropdown closes when user taps outside the search area
- Design matches mobile mockup specifications
- No UI elements overlap or are cut off

**Test Data**: 
- Mobile viewports: 320px, 375px, 414px widths
- Search terms: Various products (simple, variations, customizable)

**Priority**: High

---

## Edge Cases and Negative Tests

### Additional Test Scenarios to Consider:

**Edge Case 1: Multiple rapid searches**
- Test rapid consecutive searches to verify dropdown updates correctly without flickering or displaying stale results

**Edge Case 2: Special characters in search**
- Test search with special characters (@, #, $, %, etc.) to ensure proper handling and no XSS vulnerabilities

**Edge Case 3: Out of stock products**
- Verify how out-of-stock products are displayed in search dropdown and whether "Add to cart" is disabled/modified

**Edge Case 4: Products with very long names**
- Test products with lengthy names to ensure proper text truncation and tooltip display

**Edge Case 5: Simultaneous cart additions**
- Test adding multiple different products to cart quickly from search dropdown to verify cart consistency

---

## Notes
- Search functionality should follow Virtocommerce search module specifications (https://docs.virtocommerce.org/products/products-search-module/)
- Visual design should be validated against provided design mockups for both desktop and mobile
- Performance testing should be conducted to ensure search results load within acceptable time (<2 seconds)
- Accessibility testing (WCAG 2.1) should be performed for keyboard navigation and screen readers
- Integration testing required with cart module functionality
- Consider testing with different user roles (guest vs. authenticated users)
- Cross-browser testing recommended: Chrome, Firefox, Safari, Edge
- Related modules: Catalog Module, Cart Module, Search Module, CMS Module