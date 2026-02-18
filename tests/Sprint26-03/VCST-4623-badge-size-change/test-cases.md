# Test Cases: VCST-4623 - Change VcBadge Size in Facets

## Test Case Metadata
- **Ticket:** VCST-4623
- **Feature:** Badge Size Change in Catalog Facets
- **Test Suite:** UI/UX + Functional
- **Priority:** P2 (Medium)
- **Test Type:** Visual Regression, Functional, Accessibility
- **Created:** 2026-02-18

---

## Visual & Accessibility Test Cases (ui-ux-expert)

### TC-01: Verify Badge Size Change in Facet Filter
**Priority:** P1
**Owner:** ui-ux-expert
**Component:** facet-filter.vue

**Preconditions:**
- Navigate to catalog page with facet filters
- Ensure facets are visible (Colors, Sizes, Brands, etc.)

**Steps:**
1. Navigate to QA environment catalog page (e.g., /clothing)
2. Locate facet filter panel on left sidebar
3. Observe badge sizes displaying facet counts
4. Capture screenshot of facet badges

**Expected Result:**
- Badges display with `xs` size (smaller than previous `sm` size)
- Badge size matches design screenshot provided in ticket
- Count numbers are clearly visible and legible

**Test Data:**
- Catalog page with at least 5 different facet types
- Facet counts ranging from 1-digit to 3-digit numbers

**Status:** Pending

---

### TC-02: Verify Badge Size Change in Category Selector
**Priority:** P1
**Owner:** ui-ux-expert
**Component:** category-selector.vue

**Preconditions:**
- Navigate to catalog page
- Category selector component is accessible

**Steps:**
1. Navigate to QA environment catalog page
2. Open category selector (if modal) or locate category navigation
3. Observe badges displaying category item counts
4. Capture screenshot of category badges

**Expected Result:**
- Badges display with `xs` size
- Category count badges are clearly visible
- Badge size consistent with facet filter badges

**Test Data:**
- Categories with varying item counts (10, 50, 100+)

**Status:** Pending

---

### TC-03: Accessibility - Color Contrast Ratio
**Priority:** P1
**Owner:** ui-ux-expert
**Standard:** WCAG 2.1 AA

**Preconditions:**
- Browser DevTools or accessibility testing tool available
- Catalog page with facet badges loaded

**Steps:**
1. Navigate to catalog page with facet filters
2. Inspect badge elements using browser DevTools
3. Use color contrast checker (e.g., Chrome DevTools Lighthouse, axe DevTools)
4. Measure contrast ratio for badge text and background
5. Test both light and dark theme variants (if applicable)

**Expected Result:**
- Text contrast ratio ≥ 4.5:1 for normal text (WCAG AA)
- Outline variant badges maintain sufficient contrast
- Badge text readable in all theme configurations

**Test Data:**
- Various facet badges with different count values

**Status:** Pending

---

### TC-04: Accessibility - Touch Target Size
**Priority:** P1
**Owner:** ui-ux-expert
**Standard:** WCAG 2.1 AA (Target Size), iOS HIG (44x44px)

**Preconditions:**
- Mobile device or responsive mode in browser
- Catalog page loaded

**Steps:**
1. Switch to mobile viewport (375x667)
2. Navigate to catalog page with facet filters
3. Measure actual touch target dimensions using DevTools
4. Test tapping/clicking badge areas on touch device (if available)

**Expected Result:**
- Touch target area ≥ 44x44px (iOS guideline) or justifiable exception
- Badge clickable area includes padding
- No accidental taps on adjacent elements

**Test Data:**
- Mobile viewport testing on iOS Safari and Android Chrome

**Status:** Pending

---

### TC-05: Accessibility - Screen Reader Compatibility
**Priority:** P2
**Owner:** ui-ux-expert
**Standard:** WCAG 2.1 AA

**Preconditions:**
- Screen reader installed (NVDA, JAWS, VoiceOver)
- Catalog page with facets loaded

**Steps:**
1. Enable screen reader
2. Navigate to catalog page
3. Tab through facet filter badges
4. Verify screen reader announces badge text and count
5. Test with category selector badges

**Expected Result:**
- Screen reader announces badge count values
- Badge labels are accessible
- Navigation order is logical
- No unlabeled or confusing announcements

**Test Data:**
- Various facet badges and category badges

**Status:** Pending

---

### TC-06: Badge Readability - Single Digit Counts
**Priority:** P1
**Owner:** ui-ux-expert

**Preconditions:**
- Catalog with facets having single-digit counts (1-9)

**Steps:**
1. Navigate to catalog page
2. Locate facet badges with counts 1-9
3. Verify text readability at xs size
4. Test on desktop (1920x1080) and mobile (375x667)
5. Capture screenshots

**Expected Result:**
- Single digit numbers clearly readable
- No text truncation or overflow
- Padding appears balanced

**Test Data:**
- Facets with counts: 1, 5, 9

**Status:** Pending

---

### TC-07: Badge Readability - Double Digit Counts
**Priority:** P1
**Owner:** ui-ux-expert

**Preconditions:**
- Catalog with facets having double-digit counts (10-99)

**Steps:**
1. Navigate to catalog page
2. Locate facet badges with counts 10-99
3. Verify text readability at xs size
4. Confirm dynamic padding applied (px-1 class)
5. Test on desktop and mobile viewports
6. Capture screenshots

**Expected Result:**
- Double digit numbers clearly readable
- Dynamic padding (px-1) applied correctly
- Badge width adjusts appropriately
- No text overflow

**Test Data:**
- Facets with counts: 10, 50, 99

**Status:** Pending

---

### TC-08: Badge Readability - Triple Digit Counts
**Priority:** P1
**Owner:** ui-ux-expert

**Preconditions:**
- Catalog with facets having triple-digit counts (100+)

**Steps:**
1. Navigate to catalog page with large catalog
2. Locate facet badges with counts 100+
3. Verify text readability at xs size
4. Confirm dynamic padding applied
5. Test on desktop and mobile viewports
6. Capture screenshots

**Expected Result:**
- Triple digit numbers clearly readable
- Badge width accommodates larger numbers
- No text overflow or truncation
- Padding remains balanced

**Test Data:**
- Facets with counts: 100, 250, 999

**Status:** Pending

---

### TC-09: Responsive - Desktop Viewport (1920x1080)
**Priority:** P1
**Owner:** ui-ux-expert

**Preconditions:**
- Browser viewport set to 1920x1080

**Steps:**
1. Set browser viewport to 1920x1080
2. Navigate to catalog page with facets
3. Verify badge rendering and alignment
4. Check spacing between badges and labels
5. Capture full-page screenshot

**Expected Result:**
- Badges render correctly at desktop size
- Visual hierarchy maintained
- Spacing and alignment proper
- No layout shifts

**Test Data:**
- Full catalog page with multiple facets

**Status:** Pending

---

### TC-10: Responsive - Desktop Viewport (1366x768)
**Priority:** P2
**Owner:** ui-ux-expert

**Preconditions:**
- Browser viewport set to 1366x768

**Steps:**
1. Set browser viewport to 1366x768
2. Navigate to catalog page with facets
3. Verify badge rendering and alignment
4. Check for any layout issues at smaller desktop size
5. Capture screenshot

**Expected Result:**
- Badges render correctly at smaller desktop size
- No horizontal scrolling
- Layout remains functional

**Test Data:**
- Catalog page with multiple facets

**Status:** Pending

---

### TC-11: Responsive - Tablet Viewport (768x1024)
**Priority:** P1
**Owner:** ui-ux-expert

**Preconditions:**
- Browser viewport set to 768x1024 (iPad portrait)

**Steps:**
1. Set browser viewport to 768x1024
2. Navigate to catalog page
3. Verify facet filter layout (sidebar or drawer)
4. Check badge rendering in tablet view
5. Capture screenshot

**Expected Result:**
- Badges scale appropriately for tablet
- Touch targets remain adequate
- Layout adapts correctly

**Test Data:**
- Catalog page in tablet view

**Status:** Pending

---

### TC-12: Responsive - Mobile Viewport (375x667)
**Priority:** P1
**Owner:** ui-ux-expert

**Preconditions:**
- Browser viewport set to 375x667 (iPhone SE)

**Steps:**
1. Set browser viewport to 375x667
2. Navigate to catalog page
3. Open facet filter (likely in drawer/modal)
4. Verify badge rendering in mobile view
5. Test touch interaction with badges
6. Capture screenshot

**Expected Result:**
- Badges readable at mobile size
- Touch targets meet minimum 44x44px or close
- Drawer/modal layout functional
- No text overflow

**Test Data:**
- Catalog page in mobile view

**Status:** Pending

---

### TC-13: Responsive - Mobile Viewport (360x640)
**Priority:** P2
**Owner:** ui-ux-expert

**Preconditions:**
- Browser viewport set to 360x640 (Android common size)

**Steps:**
1. Set browser viewport to 360x640
2. Navigate to catalog page
3. Open facet filter
4. Verify badge rendering in narrow mobile view
5. Test touch interaction
6. Capture screenshot

**Expected Result:**
- Badges remain readable at narrowest mobile size
- Layout doesn't break
- Touch interaction functional

**Test Data:**
- Catalog page in Android mobile view

**Status:** Pending

---

### TC-14: Storybook Component Testing
**Priority:** P2
**Owner:** ui-ux-expert

**Preconditions:**
- Storybook environment accessible
- VcBadge component stories exist

**Steps:**
1. Navigate to QA Storybook (STORYBOOK_URL from .env)
2. Locate VcBadge component stories
3. Find story demonstrating `xs` size variant
4. Compare `xs` vs `sm` size visually (if both available)
5. Test different variants (outline, solid) at xs size
6. Capture screenshots of component isolation

**Expected Result:**
- `xs` size badge story exists or is documented
- Visual difference between `xs` and `sm` clear
- Component renders correctly in isolation
- All variants (outline, solid, colors) work at xs size

**Test Data:**
- VcBadge Storybook stories with various sizes

**Status:** Pending

---

### TC-15: Visual Comparison Against Design Screenshot
**Priority:** P1
**Owner:** ui-ux-expert

**Preconditions:**
- Design screenshot from JIRA ticket downloaded
- Catalog page loaded with facets

**Steps:**
1. Download reference screenshot from JIRA ticket
2. Navigate to same catalog view as screenshot
3. Capture screenshot of implemented badges
4. Compare side-by-side:
   - Badge size
   - Badge shape (rounded)
   - Badge color (outline, secondary)
   - Text size
   - Padding
5. Document any discrepancies

**Expected Result:**
- Implemented badges match design screenshot
- Size reduction from sm to xs is appropriate
- Visual consistency with design intent

**Test Data:**
- Reference screenshot from ticket
- Live catalog page

**Status:** Pending

---

## Functional Test Cases (qa-frontend-expert)

### TC-16: Facet Filter Badge - Color Facets
**Priority:** P1
**Owner:** qa-frontend-expert

**Preconditions:**
- Catalog with color facet filters
- Multiple color options with counts

**Steps:**
1. Navigate to catalog page with color facets (e.g., /clothing)
2. Locate color facet filter section
3. Verify badge displays next to each color option
4. Verify badge shows correct count for each color
5. Click on color option to apply filter
6. Verify badge count updates after filter applied
7. Capture screenshot

**Expected Result:**
- Badges display correctly for all color options
- Counts are accurate
- Badges update dynamically when filter applied
- Badge size is xs
- No visual glitches

**Test Data:**
- Color facets: Red (25), Blue (18), Green (12)

**Status:** Pending

---

### TC-17: Facet Filter Badge - Size Facets
**Priority:** P1
**Owner:** qa-frontend-expert

**Preconditions:**
- Catalog with size facet filters

**Steps:**
1. Navigate to catalog page with size facets (e.g., /clothing)
2. Locate size facet filter section
3. Verify badge displays next to each size option
4. Verify badge shows correct count for each size
5. Apply size filter
6. Verify badge behavior after filter applied
7. Capture screenshot

**Expected Result:**
- Badges display correctly for all size options
- Counts accurate (S: 30, M: 45, L: 38, XL: 22)
- Badges update when filter applied
- xs size maintained

**Test Data:**
- Size facets with varying counts

**Status:** Pending

---

### TC-18: Facet Filter Badge - Brand Facets
**Priority:** P1
**Owner:** qa-frontend-expert

**Preconditions:**
- Catalog with brand facet filters

**Steps:**
1. Navigate to catalog page with brand facets
2. Locate brand facet filter section
3. Verify badge displays next to each brand option
4. Test scrolling behavior if many brands
5. Apply brand filter
6. Verify badge updates
7. Capture screenshot

**Expected Result:**
- Badges display correctly for all brands
- Counts accurate
- Scrolling works if long list
- Filter application updates badges correctly

**Test Data:**
- Brands: Nike (45), Adidas (38), Puma (22)

**Status:** Pending

---

### TC-19: Facet Filter Badge - Price Range Facets
**Priority:** P1
**Owner:** qa-frontend-expert

**Preconditions:**
- Catalog with price range facets

**Steps:**
1. Navigate to catalog page with price facets
2. Locate price range facet section
3. Verify badge displays next to each price range
4. Verify counts for price ranges
5. Apply price filter
6. Verify badge updates
7. Capture screenshot

**Expected Result:**
- Badges display for all price ranges
- Counts accurate ($0-$50: 60, $50-$100: 45)
- Filter application works correctly
- xs size badge maintained

**Test Data:**
- Price ranges with product counts

**Status:** Pending

---

### TC-20: Facet Filter Badge - Custom Property Facets
**Priority:** P2
**Owner:** qa-frontend-expert

**Preconditions:**
- Catalog with custom property facets (e.g., Material, Style)

**Steps:**
1. Navigate to catalog page with custom facets
2. Locate custom property facet sections
3. Verify badge displays and counts
4. Test multiple custom facet types
5. Capture screenshot

**Expected Result:**
- Badges work for custom properties
- Counts accurate
- Consistent xs sizing across all facet types

**Test Data:**
- Custom facets: Material (Cotton: 40, Polyester: 30)

**Status:** Pending

---

### TC-21: Category Selector Badge - Category Navigation
**Priority:** P1
**Owner:** qa-frontend-expert

**Preconditions:**
- Category selector accessible
- Multiple categories with item counts

**Steps:**
1. Navigate to catalog page
2. Open category selector (button/modal)
3. Verify badges display next to category names
4. Verify counts show total items in each category
5. Click on category to navigate
6. Verify badge behavior on category page
7. Capture screenshots (selector open + category page)

**Expected Result:**
- Badges display in category selector
- Counts accurate for each category
- Navigation works correctly
- xs size badges maintained

**Test Data:**
- Categories: Electronics (120), Clothing (85), Home (64)

**Status:** Pending

---

### TC-22: Category Selector Badge - Multi-Level Categories
**Priority:** P1
**Owner:** qa-frontend-expert

**Preconditions:**
- Category hierarchy with subcategories

**Steps:**
1. Open category selector
2. Expand parent category to show subcategories
3. Verify badges display for both parent and child categories
4. Verify counts are correct at each level
5. Navigate through multiple levels
6. Capture screenshot

**Expected Result:**
- Badges display at all category levels
- Parent count = sum of child counts (or total products)
- Expansion/collapse works correctly
- xs size consistent across levels

**Test Data:**
- Parent: Clothing (85)
  - Child: Shirts (30), Pants (25), Dresses (30)

**Status:** Pending

---

### TC-23: Badge Interaction - Clickable Areas
**Priority:** P1
**Owner:** qa-frontend-expert

**Preconditions:**
- Catalog page with facets loaded

**Steps:**
1. Navigate to catalog page
2. Hover over facet badges
3. Verify cursor changes (if badges are clickable)
4. Click on facet label (not badge)
5. Verify filter applies
6. Test if badge itself is clickable or just label
7. Test on mobile (touch interaction)

**Expected Result:**
- Appropriate cursor for clickable elements
- Filter applies when label/option clicked
- Badge doesn't interfere with label interaction
- Touch targets adequate on mobile

**Test Data:**
- Various facet options with badges

**Status:** Pending

---

### TC-24: Badge Dynamic Padding - Count Value Changes
**Priority:** P2
**Owner:** qa-frontend-expert

**Preconditions:**
- Catalog with filters that change facet counts

**Steps:**
1. Navigate to catalog page
2. Note initial badge counts and padding
3. Apply a filter (e.g., price range)
4. Observe facet badge counts decrease
5. Verify padding adjusts:
   - Single digit (no px-1)
   - Double/triple digit (px-1 applied)
6. Remove filter
7. Verify padding reverts correctly
8. Capture screenshots of transitions

**Expected Result:**
- Padding class (px-1) applies correctly based on count
- Transition smooth when counts change
- Badge width adjusts without layout shift
- Consistent behavior across facet types

**Test Data:**
- Facet counts transitioning: 150 → 8, 9 → 12, 95 → 104

**Status:** Pending

---

### TC-25: Cross-Browser - Chrome (Latest)
**Priority:** P1
**Owner:** qa-frontend-expert

**Preconditions:**
- Google Chrome (latest version) installed

**Steps:**
1. Open Chrome browser
2. Navigate to QA catalog page
3. Verify badge rendering in facets
4. Verify badge rendering in category selector
5. Test responsive behavior (desktop, tablet, mobile viewports)
6. Capture screenshots at key viewports

**Expected Result:**
- Badges render correctly in Chrome
- xs size maintained
- No visual glitches
- Responsive behavior works

**Test Data:**
- Multiple viewports: 1920x1080, 768x1024, 375x667

**Status:** Pending

---

### TC-26: Cross-Browser - Firefox (Latest)
**Priority:** P1
**Owner:** qa-frontend-expert

**Preconditions:**
- Mozilla Firefox (latest version) installed

**Steps:**
1. Open Firefox browser
2. Navigate to QA catalog page
3. Verify badge rendering in facets
4. Verify badge rendering in category selector
5. Test responsive behavior
6. Compare visually to Chrome results
7. Capture screenshots

**Expected Result:**
- Badges render correctly in Firefox
- Visual parity with Chrome
- xs size consistent
- Responsive behavior works

**Test Data:**
- Multiple viewports: 1920x1080, 768x1024, 375x667

**Status:** Pending

---

### TC-27: Cross-Browser - Edge (Latest)
**Priority:** P1
**Owner:** qa-frontend-expert

**Preconditions:**
- Microsoft Edge (latest version) installed

**Steps:**
1. Open Edge browser
2. Navigate to QA catalog page
3. Verify badge rendering in facets
4. Verify badge rendering in category selector
5. Test responsive behavior
6. Compare visually to Chrome/Firefox
7. Capture screenshots

**Expected Result:**
- Badges render correctly in Edge
- Visual parity with Chrome/Firefox
- xs size consistent
- Responsive behavior works

**Test Data:**
- Multiple viewports: 1920x1080, 768x1024, 375x667

**Status:** Pending

---

### TC-28: Visual Regression - Cart Badge (Header)
**Priority:** P2
**Owner:** qa-frontend-expert

**Preconditions:**
- Products in cart to show cart badge

**Steps:**
1. Add products to cart (ensure count > 0)
2. Navigate to various pages (home, catalog, product)
3. Verify cart badge in header
4. Check if cart badge uses same VcBadge component
5. Verify size has NOT changed (should remain sm or original size)
6. Capture screenshot

**Expected Result:**
- Cart badge NOT affected by this change
- Cart badge maintains original size
- No visual regression in header

**Test Data:**
- Cart with 3 items

**Status:** Pending

---

### TC-29: Visual Regression - Product Availability Badges
**Priority:** P2
**Owner:** qa-frontend-expert

**Preconditions:**
- Product listing/grid page

**Steps:**
1. Navigate to catalog product listing
2. Locate products with availability badges (In Stock, Low Stock, Out of Stock)
3. Verify badge sizes
4. Check if these badges use VcBadge component
5. Verify no unintended size changes
6. Capture screenshot

**Expected Result:**
- Product availability badges NOT affected
- Maintain original size
- No visual regression

**Test Data:**
- Products with various availability statuses

**Status:** Pending

---

### TC-30: Visual Regression - Sale/Promotion Badges
**Priority:** P2
**Owner:** qa-frontend-expert

**Preconditions:**
- Products with sale/promotion badges

**Steps:**
1. Navigate to catalog or product detail page
2. Locate sale/promotion badges (e.g., "Sale", "20% Off", "New")
3. Verify badge sizes
4. Check if affected by this change
5. Verify no visual regressions
6. Capture screenshot

**Expected Result:**
- Sale/promotion badges NOT affected
- Maintain original size and styling
- No layout issues

**Test Data:**
- Products on sale with promotional badges

**Status:** Pending

---

### TC-31: Multiple Filters Applied - Badge Updates
**Priority:** P1
**Owner:** qa-frontend-expert

**Preconditions:**
- Catalog with multiple facet types

**Steps:**
1. Navigate to catalog page
2. Apply first filter (e.g., Color: Red)
3. Observe badge count updates in other facets
4. Apply second filter (e.g., Size: M)
5. Observe badge counts update again
6. Apply third filter (e.g., Brand: Nike)
7. Verify all badges update correctly
8. Remove filters one by one
9. Verify badges revert correctly
10. Capture screenshots at each step

**Expected Result:**
- Badge counts update accurately after each filter
- xs size maintained throughout
- No layout shifts during updates
- Smooth transitions
- Correct counts when filters removed

**Test Data:**
- Layered filters: Color (Red) + Size (M) + Brand (Nike)

**Status:** Pending

---

### TC-32: No Search Results - Badge Behavior
**Priority:** P2
**Owner:** qa-frontend-expert

**Preconditions:**
- Catalog with facets

**Steps:**
1. Navigate to catalog page
2. Apply filters that result in zero products
3. Observe facet badge behavior
4. Verify badges show zero or facets are disabled/hidden
5. Remove filters
6. Verify badges return to normal
7. Capture screenshot of zero state

**Expected Result:**
- Badges handle zero counts gracefully
- Either show "0" or facets are hidden/disabled
- No layout issues
- Clear indication of no results

**Test Data:**
- Filter combination resulting in zero products

**Status:** Pending

---

### TC-33: Page Load Performance - Badge Rendering
**Priority:** P3
**Owner:** qa-frontend-expert

**Preconditions:**
- Browser DevTools Performance tab ready

**Steps:**
1. Open DevTools Performance tab
2. Start recording
3. Navigate to catalog page with many facets
4. Stop recording when page fully loaded
5. Analyze badge rendering time
6. Compare with baseline (if available)
7. Verify no significant performance regression

**Expected Result:**
- Badge rendering doesn't cause performance issues
- No layout thrashing
- Smooth page load
- No significant difference from sm size performance

**Test Data:**
- Catalog with 50+ facet options across 10 facet types

**Status:** Pending

---

## Test Summary

**Total Test Cases:** 33
- **Visual & Accessibility:** 15 (TC-01 to TC-15)
- **Functional:** 18 (TC-16 to TC-33)

**Priority Breakdown:**
- P1 (Critical): 23 test cases
- P2 (High): 9 test cases
- P3 (Medium): 1 test case

**Owner Distribution:**
- ui-ux-expert: 15 test cases
- qa-frontend-expert: 18 test cases

**Estimated Execution Time:**
- Visual & Accessibility: 2-3 hours
- Functional: 3-4 hours
- Total: 5-7 hours

---

## Test Execution Notes

### Prerequisites
- QA environment accessible (FRONT_URL from .env)
- PR artifact deployed or changes merged to QA
- Test accounts and test data available
- Browser matrix available (Chrome, Firefox, Edge)
- Screen reader software (for accessibility testing)
- DevTools or accessibility testing tools

### Test Data Requirements
1. Catalog with multiple facet types (color, size, brand, price, custom)
2. Categories with varying product counts (1-digit, 2-digit, 3-digit)
3. Products with multiple filter combinations
4. Test user account with cart items

### Reporting
- Document results in test-execution-report.md
- Capture screenshots in screenshots/ directory
- Log any bugs in reports/bugs/
- Update JIRA ticket with progress
