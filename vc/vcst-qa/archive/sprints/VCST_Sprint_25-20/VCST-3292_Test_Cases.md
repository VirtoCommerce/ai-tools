# Test Cases for VCST-3292: [Mobile] Floating menu with button "Add to cart" on the product details page

## User Story Details
- **Jira Key**: VCST-3292
- **Summary**: [Mobile] Floating menu with button "Add to cart" on the product details page
- **Priority**: Medium
- **Status**: Ready for test
- **Created**: 5/15/2025

## Description
As a user I want to have a ADD TO CART button that leads me to the order so I can successfully order products I've added to cart.

---

## Test Cases

### Test Case 1: Verify "Add to Cart" button is visible in floating menu on mobile product details page
**Objective**: Validate that the floating menu with "Add to Cart" button is displayed on mobile devices when viewing a product details page

**Preconditions**:
- Mobile device or mobile emulator is configured
- User is on the storefront (https://docs.virtocommerce.org/platform/user-guide/storefront/)
- At least one product with available stock exists in the catalog
- User has navigated to a product details page

**Test Steps**:
1. Open the storefront on a mobile device or browser with mobile viewport
2. Navigate to any product details page (https://docs.virtocommerce.org/platform/user-guide/catalog/)
3. Scroll down the product details page
4. Observe the floating menu behavior

**Expected Results**:
- Floating menu is visible at the bottom of the screen on mobile view
- "Add to Cart" button is clearly displayed within the floating menu
- Button remains fixed/floating when scrolling through product details
- Button text is readable and properly formatted
- Floating menu does not obstruct critical product information

**Test Data**: 
- Product SKU: Any in-stock product
- Mobile viewport: 375x667 (iPhone SE) or 414x896 (iPhone XR)

**Priority**: High

---

### Test Case 2: Verify successful product addition to cart and navigation to cart page
**Objective**: Validate that clicking "Add to Cart" button successfully adds the product to cart and navigates to the cart/order page

**Preconditions**:
- Mobile device or mobile emulator is configured
- User is on the storefront
- User is on a product details page with an in-stock product
- Cart is empty or has known state (https://docs.virtocommerce.org/platform/user-guide/orders/)

**Test Steps**:
1. Open a product details page on mobile view
2. Verify the floating "Add to Cart" button is displayed
3. Click/tap on the "Add to Cart" button in the floating menu
4. Observe the system response and navigation

**Expected Results**:
- Product is successfully added to the cart
- User is redirected to the cart/checkout page
- Cart displays the newly added product with correct details (name, quantity, price)
- Cart total is calculated correctly
- Success notification/feedback is displayed (if applicable)

**Test Data**: 
- Product: Standard product with price $50.00, available quantity > 10
- Initial cart state: Empty

**Priority**: High

---

### Test Case 3: Verify "Add to Cart" button behavior with product variants/options
**Objective**: Validate that "Add to Cart" button properly handles products with required variants or options

**Preconditions**:
- Mobile device or mobile emulator is configured
- User is on the storefront
- Product with required variants (size, color, etc.) exists in catalog (https://docs.virtocommerce.org/platform/user-guide/catalog/)
- User has navigated to such product's details page

**Test Steps**:
1. Open a product details page with required variants (e.g., clothing with size/color options) on mobile view
2. Do NOT select any required variant/option
3. Click/tap the "Add to Cart" button in the floating menu
4. Observe system behavior
5. Select all required variants/options
6. Click/tap the "Add to Cart" button again

**Expected Results**:
- When required variants are not selected: validation message is displayed, product is NOT added to cart
- Error message clearly indicates which options must be selected
- Page does not navigate away when validation fails
- When all required variants are selected: product is added to cart successfully
- User is redirected to cart page with correct variant details displayed

**Test Data**: 
- Product: T-shirt with required Size (S, M, L, XL) and Color (Red, Blue, Green) options
- Test both: no selection, partial selection, and complete selection

**Priority**: High

---

### Test Case 4: Verify "Add to Cart" button behavior when product is out of stock
**Objective**: Validate proper handling and display when attempting to add an out-of-stock product

**Preconditions**:
- Mobile device or mobile emulator is configured
- User is on the storefront
- Product with zero inventory/out of stock status exists (https://docs.virtocommerce.org/platform/user-guide/catalog/)
- User has navigated to the out-of-stock product details page

**Test Steps**:
1. Navigate to a product details page for an out-of-stock item on mobile view
2. Observe the floating menu and "Add to Cart" button state
3. Attempt to click/tap the "Add to Cart" button (if enabled)
4. Observe system response

**Expected Results**:
- "Add to Cart" button is either disabled/grayed out OR replaced with "Out of Stock" message
- If button is clickable, appropriate error message is displayed
- User is NOT redirected to cart page
- Product is NOT added to cart
- Alternative options are presented (e.g., "Notify when available", "View similar products")
- Out of stock status is clearly communicated to the user

**Test Data**: 
- Product: Any product with inventory quantity = 0 or availability status = "Out of Stock"

**Priority**: Medium

---

### Test Case 5: Verify floating menu responsiveness across different mobile screen sizes and orientations
**Objective**: Validate that the floating menu with "Add to Cart" button displays correctly across various mobile devices and orientations

**Preconditions**:
- Multiple mobile device viewports or emulators available for testing
- User is on the storefront
- User has access to product details pages

**Test Steps**:
1. Open a product details page on smallest mobile viewport (e.g., iPhone SE - 375x667)
2. Verify floating menu and button display
3. Rotate device to landscape orientation
4. Verify floating menu and button display
5. Repeat steps 1-4 for medium mobile device (e.g., iPhone 12 - 390x844)
6. Repeat steps 1-4 for larger mobile device (e.g., iPhone 14 Pro Max - 430x932)
7. Test on Android device viewports (e.g., Samsung Galaxy S21 - 360x800)

**Expected Results**:
- Floating menu remains visible and properly positioned on all tested viewports
- "Add to Cart" button is fully visible and accessible (not cut off) on all screen sizes
- Button text is readable without truncation
- Touch target size is adequate (minimum 44x44 pixels) for easy tapping
- In landscape orientation, floating menu adjusts appropriately and doesn't cover essential content
- Layout remains consistent across iOS and Android viewports
- No horizontal scrolling is required to access the button

**Test Data**: 
- Test viewports: 
  - 375x667 (iPhone SE)
  - 390x844 (iPhone 12/13)
  - 414x896 (iPhone 11 Pro Max)
  - 430x932 (iPhone 14 Pro Max)
  - 360x800 (Samsung Galaxy S21)
- Orientations: Portrait and Landscape

**Priority**: Medium

---

## Edge Cases and Negative Tests

**Note**: Edge cases are covered within the test cases above, specifically:
- Test Case 3: Handles validation scenarios with variants
- Test Case 4: Covers out-of-stock/negative inventory scenarios
- Test Case 5: Addresses responsive design edge cases

---

## Notes
- All tests should be performed on actual mobile devices in addition to emulators when possible
- Test on both iOS Safari and Android Chrome browsers for cross-browser compatibility
- Verify that the floating menu doesn't interfere with accessibility features (screen readers, voice control)
- Performance testing: Ensure the floating menu doesn't cause lag or rendering issues on lower-end devices
- Related documentation: 
  - Product Catalog: https://docs.virtocommerce.org/platform/user-guide/catalog/
  - Orders and Cart: https://docs.virtocommerce.org/platform/user-guide/orders/
  - Storefront: https://docs.virtocommerce.org/platform/user-guide/storefront/
- Dependencies: Ensure inventory management and cart functionality are working correctly before testing this feature
- Consider testing integration with analytics to track "Add to Cart" button interactions