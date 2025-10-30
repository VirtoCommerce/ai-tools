# Test Cases for VCST-3943: [PDP] Improve keyboard navigation in product details page

## User Story Details
- **Jira Key**: VCST-3943
- **Summary**: [PDP] Improve keyboard navigation in product details page
- **Priority**: Medium
- **Status**: Done
- **Created**: 9/16/2025

## Description
Required layout changes for native tab navigation.

---

## Test Cases

### Test Case 1: Verify Sequential Tab Navigation Through All Interactive Elements on PDP
**Objective**: Validate that all interactive elements on the Product Details Page can be accessed sequentially using the Tab key in a logical order.

**Preconditions**:
- Virtocommerce storefront is accessible and running
- User has navigated to a [Product Details Page](https://docs.virtocommerce.org/products/)
- At least one product with full details (images, variants, add to cart button, quantity selector) is available
- Browser is focused on the page URL bar or page start

**Test Steps**:
1. Navigate to any product details page in the storefront
2. Press the Tab key repeatedly to navigate through all interactive elements
3. Observe the visual focus indicator on each element
4. Document the tab order sequence: product image gallery → variant selectors → quantity input → add to cart button → product tabs (description, specifications, reviews) → related products
5. Verify no interactive elements are skipped
6. Press Shift+Tab to navigate backwards through elements

**Expected Results**:
- All interactive elements receive visible focus indicator when tabbed to
- Tab order follows a logical top-to-bottom, left-to-right flow matching visual layout
- No elements are skipped in the tab sequence
- Shift+Tab reverses the navigation order correctly
- Hidden or disabled elements are not included in tab order
- Focus indicators meet WCAG 2.1 contrast requirements

**Test Data**: Any product with multiple variants (e.g., size, color options)

**Priority**: High

---

### Test Case 2: Verify Keyboard Interaction with Product Variant Selection
**Objective**: Ensure that product variant options (size, color, etc.) can be selected and changed using only keyboard controls.

**Preconditions**:
- User is on a [Product Details Page](https://docs.virtocommerce.org/products/) with multiple variants (colors, sizes, etc.)
- Product has at least 2-3 available variants per option type
- Browser focus is at the beginning of the page

**Test Steps**:
1. Tab to the first variant selector (e.g., Color dropdown/buttons)
2. Press Enter or Space to activate the selector
3. Use Arrow keys (Up/Down or Left/Right) to navigate through variant options
4. Press Enter or Space to select a variant
5. Verify the product image and price update according to selected variant
6. Press Escape key to close dropdown (if applicable)
7. Tab to the next variant selector (e.g., Size) and repeat steps 2-6
8. Verify product availability updates based on selected variant combination

**Expected Results**:
- Variant selectors receive focus when tabbed to
- Enter/Space keys activate the variant selection controls
- Arrow keys navigate through available variant options
- Selected variant is visually highlighted
- Product image, price, and availability information update dynamically
- Escape key closes any open dropdown menus
- Focus remains on the variant selector after selection

**Test Data**: 
- Product with Color variants: Red, Blue, Green
- Product with Size variants: S, M, L, XL

**Priority**: High

---

### Test Case 3: Verify Keyboard Navigation in Product Image Gallery
**Objective**: Validate that users can navigate and interact with the product image gallery using only keyboard controls.

**Preconditions**:
- User is on a Product Details Page with multiple product images (minimum 3 images)
- Product image gallery includes thumbnails and main display image
- Page is fully loaded

**Test Steps**:
1. Tab to the product image gallery section
2. Verify focus lands on the main product image or first thumbnail
3. Use Arrow keys (Left/Right or Up/Down depending on layout) to navigate between thumbnail images
4. Press Enter or Space to display the selected thumbnail in main view
5. Tab to zoom/expand button (if available)
6. Press Enter to open lightbox/modal view
7. Use Arrow keys to navigate between images in expanded view
8. Press Escape to close lightbox and return focus to the gallery

**Expected Results**:
- Image gallery receives focus and shows visible focus indicator
- Arrow keys successfully navigate between thumbnails
- Enter/Space key displays selected thumbnail as main image
- Main image updates smoothly when thumbnail is selected
- Lightbox/modal opens when activated with keyboard
- Navigation within lightbox works with Arrow keys
- Escape closes lightbox and returns focus to last focused element
- Focus is trapped within modal when open

**Test Data**: Product with 4-6 images showing different angles/views

**Priority**: Medium

---

### Test Case 4: Verify Keyboard Navigation in Product Tabs and Accordion Sections
**Objective**: Ensure that product information tabs (Description, Specifications, Reviews) can be navigated and activated using keyboard controls.

**Preconditions**:
- User is on a [Product Details Page](https://docs.virtocommerce.org/products/) with tabbed or accordion sections
- Product has content in Description, Specifications, and Reviews sections
- Page content is fully loaded

**Test Steps**:
1. Tab to the product information tabs section (Description, Specifications, Reviews)
2. Verify focus lands on the first tab/accordion header
3. Use Arrow keys (Left/Right for horizontal tabs, Up/Down for vertical) to move between tab headers
4. Press Enter or Space to activate the focused tab
5. Press Tab to move focus into the active tab content
6. Tab through any interactive elements within the tab content (links, forms, etc.)
7. Shift+Tab back to tab headers
8. Use Home key to jump to first tab, End key to jump to last tab

**Expected Results**:
- Tab headers receive visible focus indicator
- Arrow keys navigate between tab headers without activating them (Roving tabindex pattern)
- Enter/Space activates the focused tab and displays its content
- Only the active tab is in the tab order (tabindex="0"), others have tabindex="-1"
- Tab key moves focus into tab panel content
- Interactive elements within tab content are keyboard accessible
- Home/End keys work for quick navigation to first/last tabs
- ARIA attributes (role="tablist", aria-selected) are properly implemented

**Test Data**: 
- Description tab with formatted text and embedded links
- Specifications tab with product attributes table
- Reviews tab with review form and existing reviews

**Priority**: High

---

### Test Case 5: Verify Keyboard Accessibility of Quantity Selector and Add to Cart
**Objective**: Validate that quantity input and add to cart functionality can be operated completely via keyboard.

**Preconditions**:
- User is on a [Product Details Page](https://docs.virtocommerce.org/products/) with available stock
- Shopping cart functionality is enabled
- User is not logged in (to test guest checkout accessibility)

**Test Steps**:
1. Tab to the quantity input field/selector
2. Use Up/Down arrow keys or type a number to adjust quantity
3. Verify quantity increment/decrement buttons can be reached via Tab (if present)
4. Press Enter or Space on increment button to increase quantity
5. Press Enter or Space on decrement button to decrease quantity
6. Tab to "Add to Cart" button
7. Press Enter or Space to add product to cart
8. Verify cart notification/modal appears and focus is managed appropriately
9. Press Escape or Tab to cart notification close button to dismiss
10. Verify focus returns to "Add to Cart" button or logical next element

**Expected Results**:
- Quantity input receives focus with visible indicator
- Number keys work to directly enter quantity
- Up/Down arrow keys increment/decrement quantity (if supported)
- Quantity buttons (+ and -) are keyboard accessible
- Quantity validation works (minimum 1, maximum stock quantity)
- "Add to Cart" button receives focus and activates with Enter/Space
- Success notification appears and is keyboard accessible
- Focus is properly managed when notification opens/closes
- Cart icon updates to reflect new item count
- Error messages are announced for screen readers if quantity exceeds stock

**Test Data**: 
- Product with stock quantity: 50
- Test quantities: 1, 5, 51 (exceeds stock)

**Priority**: High

---

## Edge Cases and Negative Tests

### Test Case 6: Verify Keyboard Navigation with Out of Stock Product Variants
**Objective**: Test keyboard navigation behavior when certain product variants are unavailable or out of stock.

**Preconditions**:
- User is on a Product Details Page with multiple variants
- At least one variant combination is out of stock
- Product has "Notify when available" or disabled state for unavailable variants

**Test Steps**:
1. Tab to variant selectors on the page
2. Select a variant combination that results in "Out of Stock" status using keyboard only
3. Tab to the "Add to Cart" button
4. Verify button state (disabled or changed to "Notify Me")
5. Attempt to activate the button with Enter or Space
6. Tab to "Notify Me" form field (if applicable) and complete using keyboard
7. Navigate to another variant combination that is in stock
8. Verify "Add to Cart" button becomes enabled and keyboard accessible

**Expected Results**:
- Out of stock variants are clearly indicated visually when focused
- Disabled variants may be skipped in tab order or marked as disabled (aria-disabled="true")
- "Add to Cart" button is disabled (aria-disabled="true") when product is unavailable
- Disabled button can still receive focus but provides appropriate feedback when activated
- "Notify Me" functionality (if present) is fully keyboard accessible
- Switching to available variant re-enables Add to Cart button
- Screen reader announces out of stock status
- Focus management remains logical throughout variant changes

**Test Data**: 
- Product with multiple variants where specific combinations are out of stock

**Priority**: Medium

---

## Notes
- All keyboard navigation should follow [WAI-ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/) patterns
- Focus indicators should meet WCAG 2.1 Level AA standards (minimum 3:1 contrast ratio)
- Test with multiple browsers: Chrome, Firefox, Safari, Edge
- Test should be performed with screen reader testing for complete accessibility validation (JAWS, NVDA, VoiceOver)
- Related to storefront accessibility improvements
- Ensure focus is never lost or trapped in non-modal contexts
- Skip links should be provided for keyboard users to bypass repetitive navigation
- All keyboard tests should be verified on both desktop and tablet viewports