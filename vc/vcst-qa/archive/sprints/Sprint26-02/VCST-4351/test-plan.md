---
name: Test Plan PR 2121
overview: "Comprehensive test plan for PR #2121 (VCST-4351 - Search Cards Feature) covering unit tests, visual regression, responsive design, integration testing, accessibility, and cross-browser validation."
todos: []
isProject: false
---

# Test Plan for PR #2121: VCST-4351 - Search Cards Feature

## Overview

This test plan validates the product card component refactoring for search results, focusing on list view layout improvements, responsive breakpoint changes, and CSS variable updates.

## Test Environment Setup

### Prerequisites

- Test database/API mock setup
- Browser testing tools (Chrome, Firefox, Safari, Edge)
- Screen size testing tools (responsive design mode)

### Test Data Requirements

- Products with variations
- Products without variations
- Products with/without vendor
- Products with/without images
- Products with different price ranges
- Products with long/short titles

## 1. Unit Tests

### 1.1 Product Card Component (`vc-product-card.vue`)

**Test File**: `client-app/ui-kit/components/organisms/product-card/vc-product-card.test.ts`

#### Grid Layout Tests

- [ ] Grid view renders correctly with all child components
- [ ] Grid view applies correct padding (p-5 default, p-6 at xs+)
- [ ] Grid view background and border props work correctly

#### List View Layout Tests

- [ ] List view grid structure renders correctly
- [ ] List view padding: p-3 default, p-4 at 2xl+
- [ ] Grid template areas correct for narrow containers (< 2xl)
  - [ ] Media and title layout
  - [ ] Media, title, and vendor layout
  - [ ] Media, title, and price layout
  - [ ] Media, title, and add-to-cart layout
- [ ] Grid template areas correct for wide containers (>= 2xl)
  - [ ] Image, title, price, add-to-cart layout
  - [ ] Image, vendor, price, add-to-cart layout
- [ ] Grid template areas correct for extra-wide containers (>= 4xl)
  - [ ] Properties column appears correctly
- [ ] Empty media slot is hidden (`&:empty { @apply hidden; }`)

#### View Mode Tests

- [ ] viewMode prop accepts "grid", "list", "item"
- [ ] Default viewMode is "grid"
- [ ] Background prop defaults to true

### 1.2 Product Price Component (`vc-product-price.vue`)

**Test File**: `client-app/ui-kit/components/molecules/product-price/vc-product-price.test.ts`

#### CSS Variable Tests

- [ ] `--vc-product-price-font-size` uses fallback `theme("fontSize.base")` when not set
- [ ] Font size variable updates correctly in different contexts

#### List View Responsive Tests

- [ ] Below 2xl: base font size, horizontal layout, self-start alignment
- [ ] At 2xl+: small font size, right-aligned, fixed width 7.5rem
- [ ] At 4xl+: large font size, width 10.5rem
- [ ] Variations label displays inline-block below 2xl, block at 2xl+

#### Grid View Tests

- [ ] Grid view uses large font size
- [ ] Grid view applies correct margin (mt-3) and order (order-6)

### 1.3 Product Button Component (`vc-product-button.vue`)

**Test File**: `client-app/ui-kit/components/molecules/product-button/vc-product-button.test.ts`

#### Responsive Width Tests

- [ ] List view: width 60 at sm+, width 10.625rem at 2xl+
- [ ] Link spacing: mt-3 default, mt-5 at 2xl+
- [ ] Grid view link: mt-7 spacing
- [ ] List view link: mt-1.5 at 2xl+

### 1.4 Product Actions Component (`vc-product-actions.vue`)

**Test File**: `client-app/ui-kit/components/atoms/product-actions/vc-product-actions.test.ts`

#### Breakpoint Tests

- [ ] Icon size changes at 2xl+ (was xl)
- [ ] Horizontal layout margin adjustments at 2xl+

### 1.5 Product Properties Component (`vc-product-properties.vue`)

**Test File**: `client-app/ui-kit/components/atoms/product-properties/vc-product-properties.test.ts`

#### Visibility Tests

- [ ] Hidden below 4xl in list view
- [ ] Visible at 4xl+ with width 60
- [ ] Width 64 at 5xl+

### 1.6 Product Vendor Component (`vc-product-vendor.vue`)

**Test File**: `client-app/ui-kit/components/atoms/product-vendor/vc-product-vendor.test.ts`

#### Empty State Tests

- [ ] Empty vendor is hidden (`empty:hidden`)

### 1.7 Product Title Component (`vc-product-title.vue`)

**Test File**: `client-app/ui-kit/components/atoms/product-title/vc-product-title.test.ts`

#### Alignment Tests

- [ ] List view wrapper has `flex items-center` for vertical alignment

### 1.8 Add to Cart Component (`vc-add-to-cart.vue`)

**Test File**: `client-app/ui-kit/components/organisms/add-to-cart/vc-add-to-cart.test.ts`

#### Width Tests

- [ ] List view width: 60 at sm+, 10.625rem at 2xl+
- [ ] Badge margin: mt-1 (was mt-1.5)

## 2. Visual Regression Testing (Storybook)

### 2.1 Storybook Stories Validation

**Location**: `client-app/ui-kit/components/organisms/product-card/vc-product-card.stories.ts`

#### New List View Stories

Test all 12 new list view stories:

- [ ] `ListTitleOnly` - Title only
- [ ] `ListImageTitle` - Image and title
- [ ] `ListTitleVendor` - Title and vendor
- [ ] `ListTitlePrice` - Title and price
- [ ] `ListTitleAddToCart` - Title and add-to-cart
- [ ] `ListTitleProductButton` - Title and product button
- [ ] `ListTitleVendorPrice` - Title, vendor, and price
- [ ] `ListTitlePriceAddToCart` - Title, price, and add-to-cart
- [ ] `ListTitleVendorAddToCart` - Title, vendor, and add-to-cart
- [ ] `ListTitleVendorPriceAddToCart` - All components
- [ ] `ListTitlePriceProductButton` - Title, price, and button
- [ ] `ListTitleVendorPriceProductButton` - Title, vendor, price, and button

#### Visual Checks

- [ ] All stories render without errors
- [ ] Layout matches design specifications
- [ ] Spacing and alignment are correct
- [ ] No visual regressions compared to baseline

### 2.2 Responsive Visual Testing

Test each story at different container sizes:

- [ ] Below 2xl (narrow): ~1200px container width
- [ ] At 2xl (1500px): Standard desktop
- [ ] At 4xl: Extra-wide screens
- [ ] At 5xl: Maximum width

## 3. Integration Testing

### 3.1 Search Dropdown Integration

**Test File**: `client-app/shared/layout/components/header/_internal/search-dropdown.test.ts`

#### SearchBarProductCard Integration

- [ ] SearchBarProductCard renders correctly in search dropdown
- [ ] Product cards display in list view mode
- [ ] Multiple products render correctly
- [ ] Product card click navigation works
- [ ] Keyboard navigation (arrow keys) works between cards
- [ ] Focus management works correctly
- [ ] "View all results" button appears when total > 8

#### Search Results Display

- [ ] Products section shows when `hasProducts` is true
- [ ] Product cards align correctly in dropdown
- [ ] Scrollbar works correctly with multiple products
- [ ] Loading state displays correctly
- [ ] Empty state displays when no products found

### 3.2 Search Bar Integration

**Test File**: `client-app/shared/layout/components/header/_internal/search-bar.test.ts`

#### End-to-End Search Flow

- [ ] Type search query → dropdown appears
- [ ] Product cards render in dropdown
- [ ] Click product card → navigates to product page
- [ ] Keyboard navigation works in search dropdown
- [ ] Search dropdown closes on product selection

## 4. Responsive Design Testing

### 4.1 Container Query Breakpoints

Test at specific container widths (not viewport):

#### Below 2xl (< 1500px)

- [ ] List view: 2-column grid (media + content)
- [ ] Price: base font, horizontal layout, left-aligned
- [ ] Properties: hidden
- [ ] Product button: width 60
- [ ] Add to cart: width 60

#### At 2xl (1500px+)

- [ ] List view: 4-column grid (image, title, price, add-to-cart)
- [ ] Price: small font, right-aligned, width 7.5rem
- [ ] Properties: still hidden
- [ ] Product button: width 10.625rem
- [ ] Add to cart: width 10.625rem
- [ ] Image size: 5.375rem (was smaller)

#### At 4xl

- [ ] List view: 5-column grid (includes properties)
- [ ] Price: large font, width 10.5rem
- [ ] Properties: visible, width 60
- [ ] Product properties column appears

#### At 5xl

- [ ] Properties: width 64

### 4.2 Viewport Testing

Test in actual browser viewports:

- [ ] Mobile (375px, 414px)
- [ ] Tablet (768px, 1024px)
- [ ] Desktop (1280px, 1440px, 1920px)
- [ ] Ultra-wide (2560px+)

## 5. Accessibility Testing

### 5.1 Keyboard Navigation

**Using Storybook Accessibility Addon**

- [ ] Tab navigation works through all interactive elements
- [ ] Arrow key navigation works in search dropdown
- [ ] Enter key activates product card links
- [ ] Escape key closes search dropdown
- [ ] Focus indicators are visible
- [ ] Focus order is logical

### 5.2 Screen Reader Testing

- [ ] Product cards have proper ARIA labels
- [ ] Product images have alt text
- [ ] Price information is announced correctly
- [ ] Product titles are readable
- [ ] Vendor information is announced
- [ ] Interactive elements are properly labeled

### 5.3 Color Contrast

- [ ] Text meets WCAG AA contrast ratios
- [ ] Price text is readable
- [ ] Links are distinguishable
- [ ] Focus indicators are visible

## 6. Cross-Browser Testing

### 6.1 Browser Compatibility

Test in:

- [ ] Chrome/Edge (Chromium) - Latest
- [ ] Firefox - Latest
- [ ] Safari - Latest (macOS/iOS)
- [ ] Mobile Safari (iOS)
- [ ] Chrome Mobile (Android)

### 6.2 Container Query Support

- [ ] Container queries work in all supported browsers
- [ ] Fallback behavior for unsupported browsers (if any)

## 7. Performance Testing

### 7.1 Render Performance

- [ ] Product cards render quickly (< 100ms for 8 cards)
- [ ] No layout shifts during render
- [ ] Smooth transitions between states
- [ ] No memory leaks in search dropdown

### 7.2 CSS Performance

- [ ] CSS variables update efficiently
- [ ] Container queries don't cause reflows
- [ ] No FOUC (Flash of Unstyled Content)

## 8. Edge Cases

### 8.1 Data Edge Cases

- [ ] Product with no image
- [ ] Product with very long title (2+ lines)
- [ ] Product with no vendor
- [ ] Product with no price
- [ ] Product with variations
- [ ] Product with configurable options
- [ ] Product with special characters in name
- [ ] Product with very long description

### 8.2 Layout Edge Cases

- [ ] Single product in search results
- [ ] Maximum products (8) in search results
- [ ] Empty search results
- [ ] Rapid search query changes
- [ ] Search dropdown resize during display

## 9. Regression Testing

### 9.1 Existing Functionality

- [ ] Grid view still works correctly
- [ ] Item view (cart/checkout) still works
- [ ] Product card in catalog pages unchanged
- [ ] Product card in related products unchanged
- [ ] Product card in wishlist unchanged

### 9.2 Breaking Changes Validation

- [ ] No breaking changes in component API
- [ ] Props interface unchanged
- [ ] Events interface unchanged
- [ ] Slot structure unchanged

## 10. Test Execution Checklist

### Pre-Testing

- [ ] Branch checked out: `feat/VCST-4351-search-cards`
- [ ] Dependencies installed: `yarn install`
- [ ] Storybook built: `yarn storybook:build`
- [ ] Unit tests run: `yarn test:unit`

### Test Execution Order

1. [ ] Run unit tests
2. [ ] Review Storybook stories
3. [ ] Test in search dropdown (manual)
4. [ ] Test responsive breakpoints
5. [ ] Test accessibility
6. [ ] Test cross-browser
7. [ ] Test edge cases
8. [ ] Regression testing

### Post-Testing

- [ ] Document any issues found
- [ ] Create bug reports if needed
- [ ] Update test plan with results
- [ ] Sign off on test completion

## Test Tools & Commands

### Unit Tests

```bash
yarn test:unit
yarn test:coverage
```

### Storybook

```bash
yarn storybook:dev  # Development server
yarn storybook:build  # Build for review
```

### Linting

```bash
yarn lint
yarn validate:types
```

## Success Criteria

All tests must pass:

- ✅ 100% of unit tests pass
- ✅ All Storybook stories render correctly
- ✅ No visual regressions
- ✅ Search dropdown works correctly
- ✅ Responsive breakpoints work as expected
- ✅ Accessibility standards met (WCAG AA)
- ✅ Cross-browser compatibility confirmed
- ✅ No performance degradation
- ✅ No breaking changes to existing functionality

## Risk Areas

High-risk areas requiring extra attention:

1. **Container query breakpoints** - Changed from xl to 2xl
2. **Grid layout changes** - Properties column visibility
3. **Width adjustments** - Fixed widths changed
4. **CSS variable naming** - Font size variable changed
5. **Search dropdown integration** - Primary use case

## Notes

- Container queries use `@container` syntax, not media queries
- Breakpoint `2xl` = 1500px (not default 1536px)
- Test container width, not viewport width for container queries
- Search dropdown uses `SearchBarProductCard` which wraps `VcProductCard`