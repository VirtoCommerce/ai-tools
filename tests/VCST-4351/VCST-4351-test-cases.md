# Test Cases for VCST-4351 - Search Cards Feature

**Feature**: Product Card Component Refactoring  
**PR**: #2121  
**Test Date**: January 28, 2026  
**Tester**: QA Agent

## Test Case 1: Grid Layout Rendering

**Priority**: High  
**Category**: Unit Test  
**Component**: vc-product-card.vue

### Test Steps:
1. Render product card in grid view mode
2. Verify padding is p-5 by default
3. Verify padding changes to p-6 at xs+ breakpoint
4. Verify background and border props apply correctly

### Expected Results:
- Grid view renders all child components
- Padding classes applied correctly based on breakpoint
- Background and border properties work as expected

### Test Data:
- Product with complete data (image, title, price, vendor)

---

## Test Case 2: List View Layout - Narrow Container

**Priority**: High  
**Category**: Responsive Design  
**Component**: vc-product-card.vue

### Test Steps:
1. Set container width to < 1500px (below 2xl)
2. Render product card in list view mode
3. Verify 2-column grid (media + content)
4. Check padding: p-3 default, p-4 at 2xl+
5. Verify grid template areas for different slot combinations:
   - Media and title layout
   - Media, title, and vendor layout
   - Media, title, and price layout
   - Media, title, and add-to-cart layout

### Expected Results:
- Two-column grid structure renders correctly
- Correct padding applied
- Grid areas adapt to available slots
- Media slot hides when empty

### Test Data:
- Products with various slot combinations

---

## Test Case 3: List View Layout - Wide Container (2xl+)

**Priority**: High  
**Category**: Responsive Design  
**Component**: vc-product-card.vue

### Test Steps:
1. Set container width to 1500px+ (at 2xl breakpoint)
2. Render product card in list view mode
3. Verify 4-column grid (image, title, price, add-to-cart)
4. Check image size is 5.375rem
5. Verify product button width is 10.625rem
6. Verify add-to-cart width is 10.625rem

### Expected Results:
- Four-column grid structure renders correctly
- Image size updated correctly
- Button widths match specifications
- Price component right-aligned with width 7.5rem

### Test Data:
- Product with all components (image, title, vendor, price, add-to-cart)

---

## Test Case 4: List View Layout - Extra Wide Container (4xl+)

**Priority**: Medium  
**Category**: Responsive Design  
**Component**: vc-product-card.vue

### Test Steps:
1. Set container width to 4xl breakpoint
2. Render product card in list view mode
3. Verify 5-column grid includes properties column
4. Check properties column visibility (width 60)
5. Verify price uses large font and width 10.5rem

### Expected Results:
- Five-column grid structure with properties
- Properties column visible at 4xl+
- Properties width increases to 64 at 5xl+
- Price styling updates correctly

### Test Data:
- Product with properties data

---

## Test Case 5: Product Price Component - CSS Variables

**Priority**: High  
**Category**: Unit Test  
**Component**: vc-product-price.vue

### Test Steps:
1. Render product price without setting CSS variable
2. Verify fallback to `theme("fontSize.base")`
3. Set `--vc-product-price-font-size` variable
4. Verify variable takes effect

### Expected Results:
- Fallback font size works when variable not set
- Custom font size variable applies correctly
- No console errors or warnings

### Test Data:
- Product with price and variations

---

## Test Case 6: Product Price - Responsive Behavior

**Priority**: High  
**Category**: Responsive Design  
**Component**: vc-product-price.vue

### Test Steps:
1. Test below 2xl: base font size, horizontal layout, self-start alignment
2. Test at 2xl+: small font size, right-aligned, fixed width 7.5rem
3. Test at 4xl+: large font size, width 10.5rem
4. Verify variations label: inline-block below 2xl, block at 2xl+

### Expected Results:
- Font size changes at correct breakpoints
- Alignment adjusts based on container width
- Width constraints apply correctly
- Variations label layout changes appropriately

### Test Data:
- Product with variations

---

## Test Case 7: Product Button - Responsive Width

**Priority**: Medium  
**Category**: Responsive Design  
**Component**: vc-product-button.vue

### Test Steps:
1. Test list view width: 60 at sm+
2. Verify width changes to 10.625rem at 2xl+
3. Check link spacing: mt-3 default, mt-5 at 2xl+
4. Test grid view link: mt-7 spacing
5. Test list view link: mt-1.5 at 2xl+

### Expected Results:
- Width transitions correctly at breakpoints
- Margin spacing matches specifications
- Button maintains usability at all sizes

### Test Data:
- Product with product button (e.g., configurable product)

---

## Test Case 8: Product Actions - Icon Size

**Priority**: Low  
**Category**: Responsive Design  
**Component**: vc-product-actions.vue

### Test Steps:
1. Render product actions component
2. Verify icon size below 2xl
3. Verify icon size increases at 2xl+
4. Check horizontal layout margin adjustments

### Expected Results:
- Icon size changes at 2xl+ (was xl, now 2xl)
- Margins adjust correctly
- Icons remain properly aligned

### Test Data:
- Product with wishlist/compare actions

---

## Test Case 9: Product Properties Visibility

**Priority**: Medium  
**Category**: Responsive Design  
**Component**: vc-product-properties.vue

### Test Steps:
1. Render product card with properties in list view
2. Verify properties hidden below 4xl
3. Verify properties visible at 4xl+ with width 60
4. Verify width increases to 64 at 5xl+

### Expected Results:
- Properties column hidden on smaller containers
- Properties appear at 4xl+ breakpoint
- Width constraints apply correctly

### Test Data:
- Product with properties/specifications

---

## Test Case 10: Empty State Handling

**Priority**: High  
**Category**: Unit Test  
**Components**: Multiple

### Test Steps:
1. Render product card with empty media slot
2. Verify media slot is hidden (`:empty { @apply hidden; }`)
3. Render product card with empty vendor
4. Verify vendor component is hidden (`empty:hidden`)

### Expected Results:
- Empty slots do not create layout gaps
- Grid adapts to missing components
- No broken images or empty containers visible

### Test Data:
- Product without image
- Product without vendor

---

## Test Case 11: Storybook - List View Stories

**Priority**: High  
**Category**: Visual Regression  
**Tool**: Storybook

### Test Steps:
1. Build and serve Storybook: `yarn storybook:dev`
2. Navigate to vc-product-card stories
3. Test all 12 new list view stories:
   - ListTitleOnly
   - ListImageTitle
   - ListTitleVendor
   - ListTitlePrice
   - ListTitleAddToCart
   - ListTitleProductButton
   - ListTitleVendorPrice
   - ListTitlePriceAddToCart
   - ListTitleVendorAddToCart
   - ListTitleVendorPriceAddToCart
   - ListTitlePriceProductButton
   - ListTitleVendorPriceProductButton
4. Verify each story renders without errors
5. Check layout matches design specifications

### Expected Results:
- All stories render successfully
- No console errors
- Layouts match design specifications
- Proper spacing and alignment

---

## Test Case 12: Search Dropdown Integration

**Priority**: High  
**Category**: Integration Test  
**Component**: search-dropdown.vue

### Test Steps:
1. Navigate to application with search functionality
2. Click search input field
3. Type search query (e.g., "laptop")
4. Wait for search results to appear in dropdown
5. Verify SearchBarProductCard renders correctly
6. Verify product cards display in list view mode
7. Verify multiple products render correctly
8. Click on a product card
9. Verify navigation to product page works

### Expected Results:
- Search dropdown appears on input focus
- Product cards render in list view
- Cards display correct product information
- Click navigation works
- Dropdown closes after selection

### Test Data:
- Search query returning 8+ products

---

## Test Case 13: Search Dropdown - Keyboard Navigation

**Priority**: High  
**Category**: Accessibility  
**Component**: search-dropdown.vue

### Test Steps:
1. Open search dropdown with results
2. Press Tab key to navigate through elements
3. Press Arrow Down key to move between product cards
4. Press Arrow Up key to move backward
5. Press Enter key on focused product card
6. Press Escape key to close dropdown
7. Verify focus indicators are visible throughout

### Expected Results:
- Tab navigation works through interactive elements
- Arrow keys navigate between cards
- Enter activates selected card
- Escape closes dropdown
- Focus indicators clearly visible
- Focus returns to search input on Escape

---

## Test Case 14: Responsive Breakpoints - Container Queries

**Priority**: High  
**Category**: Responsive Design  
**Test Type**: Manual

### Test Steps:
1. Open browser DevTools
2. Enable responsive design mode
3. Test at container widths (not viewport):
   - Below 1500px (< 2xl)
   - At 1500px (2xl)
   - At 4xl breakpoint
   - At 5xl breakpoint
4. For each breakpoint, verify:
   - Grid column count
   - Component widths
   - Font sizes
   - Visibility of properties column

### Expected Results:
- Layout adapts to container width, not viewport
- All breakpoint changes occur at correct widths
- No layout breaks or overlaps
- Smooth transitions between breakpoints

### Test Data:
- Product with all components

---

## Test Case 15: Cross-Browser Compatibility

**Priority**: High  
**Category**: Cross-Browser Test  
**Browsers**: Chrome, Firefox, Safari, Edge

### Test Steps:
1. Test in Chrome (latest)
2. Test in Firefox (latest)
3. Test in Safari (latest)
4. Test in Edge (latest)
5. Test in Mobile Safari (iOS)
6. Test in Chrome Mobile (Android)
7. For each browser, verify:
   - Product cards render correctly
   - Container queries work
   - Layouts match across browsers
   - No browser-specific issues

### Expected Results:
- Consistent rendering across all browsers
- Container queries supported
- No browser-specific bugs
- Mobile browsers work correctly

---

## Test Case 16: Accessibility - Screen Reader

**Priority**: High  
**Category**: Accessibility  
**Tool**: NVDA/JAWS/VoiceOver

### Test Steps:
1. Enable screen reader
2. Navigate to search results with product cards
3. Tab through product cards
4. Verify screen reader announces:
   - Product title
   - Product price
   - Vendor information
   - Image alt text
   - Interactive elements (buttons, links)
5. Verify ARIA labels are appropriate

### Expected Results:
- All content announced correctly
- Product information clear and logical
- Images have descriptive alt text
- Interactive elements properly labeled
- Navigation order is logical

---

## Test Case 17: Color Contrast and Visual Accessibility

**Priority**: Medium  
**Category**: Accessibility  
**Tool**: Browser DevTools / Lighthouse

### Test Steps:
1. Open product card in browser
2. Use DevTools accessibility inspector
3. Check color contrast ratios for:
   - Product title text
   - Price text
   - Vendor text
   - Link text
   - Button text
4. Verify WCAG AA compliance (4.5:1 for normal text)
5. Check focus indicators are visible

### Expected Results:
- All text meets WCAG AA contrast ratios
- Focus indicators clearly visible
- No color-only information
- Links distinguishable from regular text

---

## Test Case 18: Performance - Render Speed

**Priority**: Medium  
**Category**: Performance  
**Tool**: Browser DevTools Performance Tab

### Test Steps:
1. Open DevTools Performance tab
2. Start recording
3. Trigger search with 8 product results
4. Stop recording
5. Analyze render time for product cards
6. Verify render time < 100ms for 8 cards
7. Check for layout shifts
8. Check for memory leaks after repeated searches

### Expected Results:
- Product cards render in < 100ms
- No Cumulative Layout Shift (CLS)
- Smooth transitions
- No memory leaks
- Efficient re-renders

---

## Test Case 19: Edge Case - Long Product Title

**Priority**: Medium  
**Category**: Edge Cases  
**Test Type**: Visual

### Test Steps:
1. Create/find product with very long title (100+ characters)
2. Render product card in list view
3. Test at different container widths
4. Verify title wraps correctly
5. Verify no overflow or text cutoff
6. Verify layout remains intact

### Expected Results:
- Long titles wrap to multiple lines
- No text overflow
- Layout doesn't break
- Card height adjusts appropriately
- Text remains readable

### Test Data:
- Product with 100+ character title

---

## Test Case 20: Edge Case - Missing Data

**Priority**: High  
**Category**: Edge Cases  
**Test Type**: Functional

### Test Steps:
1. Test product card with missing image
2. Test product card with no vendor
3. Test product card with no price
4. Test product card with special characters in name
5. Test product card with no description
6. Verify graceful degradation for each case

### Expected Results:
- Missing components hide correctly
- No broken image placeholders
- Layout adapts to missing data
- No JavaScript errors
- Card remains functional

### Test Data:
- Products with various missing fields

---

## Test Case 21: Regression - Grid View Unchanged

**Priority**: High  
**Category**: Regression Test  
**Test Type**: Visual + Functional

### Test Steps:
1. Render product card in grid view mode
2. Compare with previous version/baseline
3. Verify all existing grid view functionality works
4. Test grid view in catalog pages
5. Test grid view in related products
6. Test grid view in wishlist

### Expected Results:
- Grid view unchanged from previous version
- No visual regressions
- All existing functionality intact
- Props interface unchanged
- Events work as before

---

## Test Case 22: Regression - Component API

**Priority**: High  
**Category**: Regression Test  
**Test Type**: Unit

### Test Steps:
1. Review component props interface
2. Verify no breaking changes to props
3. Review component events
4. Verify no breaking changes to events
5. Review slot structure
6. Verify slots unchanged
7. Run existing unit tests
8. Verify all tests still pass

### Expected Results:
- No breaking changes to component API
- All props backward compatible
- All events backward compatible
- Slot structure unchanged
- Existing unit tests pass

---

## Test Case 23: Search Flow - End-to-End

**Priority**: Critical  
**Category**: Integration Test  
**Test Type**: E2E

### Test Steps:
1. Navigate to homepage
2. Click search input
3. Type search query "laptop"
4. Wait for dropdown to appear with results
5. Verify product cards render in list view
6. Hover over a product card
7. Click on product card
8. Verify navigation to product detail page
9. Go back to homepage
10. Test rapid query changes
11. Test clearing search
12. Test "View all results" link (if >8 products)

### Expected Results:
- Search dropdown appears instantly
- Product cards load and render correctly
- Hover states work
- Click navigation works
- Back button works
- Rapid changes don't break UI
- Clear search works
- "View all results" works correctly

---

## Test Case 24: Mobile Responsive Testing

**Priority**: High  
**Category**: Responsive Design  
**Devices**: Mobile phones

### Test Steps:
1. Test on viewport 375px (iPhone SE)
2. Test on viewport 414px (iPhone Plus)
3. Test on viewport 360px (Android)
4. For each viewport:
   - Render product cards in search dropdown
   - Verify touch targets are adequate (44x44px minimum)
   - Test scrolling behavior
   - Test tap interaction
   - Verify text is readable without zooming

### Expected Results:
- Product cards adapt to mobile viewports
- Touch targets meet size requirements
- Scrolling is smooth
- Tap interactions work
- Text remains readable
- No horizontal scrolling

---

## Test Case 25: Container Query Fallback

**Priority**: Low  
**Category**: Progressive Enhancement  
**Test Type**: Browser Support

### Test Steps:
1. Check browser support for container queries
2. Test in browser without container query support (if any)
3. Verify fallback behavior
4. Ensure basic functionality works
5. Document any degradation

### Expected Results:
- Modern browsers support container queries
- Fallback exists for unsupported browsers (if needed)
- Basic functionality works in all supported browsers
- Graceful degradation where necessary

---

## Summary

**Total Test Cases**: 25  
**Critical Priority**: 1  
**High Priority**: 16  
**Medium Priority**: 6  
**Low Priority**: 2

**Test Coverage Areas**:
- Unit Tests: 8 test cases
- Responsive Design: 8 test cases
- Integration Tests: 3 test cases
- Accessibility: 3 test cases
- Performance: 1 test case
- Edge Cases: 2 test cases
- Regression Tests: 2 test cases
- Cross-Browser: 1 test case

**Estimated Testing Time**: 8-12 hours

---

## Test Execution Instructions

### Prerequisites
```bash
# Checkout branch
git checkout feat/VCST-4351-search-cards

# Install dependencies
yarn install

# Build Storybook
yarn storybook:build
```

### Run Tests
```bash
# Unit tests
yarn test:unit

# Type validation
yarn validate:types

# Linting
yarn lint

# Start Storybook for visual testing
yarn storybook:dev
```

### Test Order
1. Execute unit tests (Test Cases 1, 5, 8, 10, 22)
2. Visual testing in Storybook (Test Case 11)
3. Integration tests (Test Cases 12, 13, 23)
4. Responsive testing (Test Cases 2, 3, 4, 6, 7, 9, 14, 24)
5. Accessibility testing (Test Cases 13, 16, 17)
6. Cross-browser testing (Test Case 15)
7. Performance testing (Test Case 18)
8. Edge cases (Test Cases 19, 20)
9. Regression testing (Test Cases 21, 22)

---

## Test Results Template

| Test Case # | Title | Status | Notes | Tester | Date |
|------------|-------|--------|-------|--------|------|
| TC-01 | Grid Layout Rendering | ⏳ | | | |
| TC-02 | List View Layout - Narrow | ⏳ | | | |
| TC-03 | List View Layout - Wide | ⏳ | | | |
| ... | ... | ... | ... | ... | ... |

**Status Legend**:
- ⏳ Pending
- ✅ Pass
- ❌ Fail
- ⚠️ Blocked
- 🔄 Retest Required
