# Manual Testing Checklist: VCST-4351 - Search Cards Feature
## PR #2121: Product Card Component Refactoring

**Test Environment:**
- Storybook URL: https://vcst-qa-storybook.govirto.com
- Frontend URL: https://vcst-qa-storefront.govirto.com
- Test Date: _____________
- Tester: _____________
- Browser: _____________
- OS: _____________

**Test Status Legend:**
- ✅ PASS - Test passed successfully
- ❌ FAIL - Test failed, bug found
- ⚠️ BLOCKED - Cannot complete test
- ⏭️ SKIP - Test skipped
- 🔄 RETEST - Needs retesting

---

## Section 1: Component Functional Testing

### 1.1 Product Card List View Layout

#### TEST-4351-001: List View Basic Rendering
**Priority:** High | **Component:** vc-product-card.vue

**Prerequisites:**
- Access to Frontend site
- Search functionality available
- Test products in database

**Test Steps:**
1. Navigate to https://vcst-qa-storefront.govirto.com
2. Click on the search bar in the header
3. Type any search query (e.g., "product")
4. Wait for search dropdown to appear
5. Observe product cards in the dropdown

**Expected Results:**
- [ ] Product cards display in list view format
- [ ] Cards show horizontal layout (image on left, content on right)
- [ ] Padding is p-3 (12px) on all sides
- [ ] Cards have proper spacing between them
- [ ] No layout overflow or broken rendering

**Screenshot Required:** ✅ Take screenshot showing list view layout

**Actual Results:**
```
Status: [ ]
Notes:




```

---

#### TEST-4351-002: List View Padding at 2xl+ Breakpoint
**Priority:** Medium | **Component:** vc-product-card.vue

**Prerequisites:**
- Browser window width >= 1500px
- Access to Frontend site

**Test Steps:**
1. Set browser window to 1600px width (use browser DevTools responsive mode)
2. Navigate to search dropdown with products
3. Inspect product card element using DevTools
4. Check computed padding values

**Expected Results:**
- [ ] Product card padding increases to p-4 (16px) at 2xl breakpoint
- [ ] Padding is consistent on all sides
- [ ] Layout remains stable, no shifts

**Screenshot Required:** ✅ DevTools showing computed padding values

**Actual Results:**
```
Status: [ ]
Computed Padding:
Notes:




```

---

#### TEST-4351-003: List View Grid Structure (Narrow Containers < 2xl)
**Priority:** High | **Component:** vc-product-card.vue

**Prerequisites:**
- Browser window < 1500px
- Product cards with all components present

**Test Steps:**
1. Set browser window to 1200px width
2. Open search dropdown with products
3. Verify grid layout structure using DevTools
4. Check that grid has 2 columns (media + content)

**Expected Results:**
- [ ] Grid displays as 2-column layout
- [ ] Column 1: Product image/media
- [ ] Column 2: Title, vendor, price, actions stacked vertically
- [ ] Grid gap spacing is appropriate
- [ ] No overlapping elements

**Screenshot Required:** ✅ Grid layout with DevTools grid overlay

**Actual Results:**
```
Status: [ ]
Grid Columns Detected:
Notes:




```

---

#### TEST-4351-004: List View Grid Structure (Wide Containers >= 2xl)
**Priority:** High | **Component:** vc-product-card.vue

**Prerequisites:**
- Browser window >= 1500px
- Product cards with all components

**Test Steps:**
1. Set browser window to 1600px width
2. Open search dropdown with products
3. Verify grid layout structure
4. Check for 4-column layout

**Expected Results:**
- [ ] Grid displays as 4-column layout
- [ ] Column 1: Product image
- [ ] Column 2: Title and vendor
- [ ] Column 3: Price
- [ ] Column 4: Add-to-cart/product button
- [ ] Columns are properly aligned
- [ ] No content truncation

**Screenshot Required:** ✅ 4-column grid layout

**Actual Results:**
```
Status: [ ]
Grid Columns Detected:
Notes:




```

---

#### TEST-4351-005: List View Grid Structure (Extra-Wide >= 4xl)
**Priority:** Medium | **Component:** vc-product-card.vue

**Prerequisites:**
- Container width >= 4xl breakpoint
- Product with properties data

**Test Steps:**
1. Set browser to ultra-wide resolution (2560px)
2. Open search dropdown or list view page
3. Verify 5-column grid layout
4. Check properties column visibility

**Expected Results:**
- [ ] Grid displays as 5-column layout
- [ ] Properties column is visible
- [ ] Properties column width is 240px (w-60)
- [ ] All columns aligned properly
- [ ] No layout breaking

**Screenshot Required:** ✅ 5-column grid with properties visible

**Actual Results:**
```
Status: [ ]
Properties Column Visible:
Width:
Notes:




```

---

### 1.2 Product Price Component

#### TEST-4351-006: Price Font Size - Below 2xl
**Priority:** Medium | **Component:** vc-product-price.vue

**Prerequisites:**
- Browser width < 1500px
- Products with prices in search results

**Test Steps:**
1. Set browser to 1200px width
2. Open search dropdown
3. Inspect price element in DevTools
4. Check computed font-size

**Expected Results:**
- [ ] Font size is base (16px)
- [ ] Price is horizontally aligned
- [ ] Price uses self-start alignment
- [ ] Text is readable and not cut off

**Screenshot Required:** ✅ DevTools showing font-size

**Actual Results:**
```
Status: [ ]
Font Size:
Notes:




```

---

#### TEST-4351-007: Price Font Size and Alignment at 2xl+
**Priority:** Medium | **Component:** vc-product-price.vue

**Prerequisites:**
- Browser width >= 1500px

**Test Steps:**
1. Set browser to 1600px width
2. Open search dropdown
3. Inspect price element
4. Check font size and alignment

**Expected Results:**
- [ ] Font size is small (14px)
- [ ] Price is right-aligned
- [ ] Fixed width of 7.5rem (120px)
- [ ] Alignment looks proper in grid

**Screenshot Required:** ✅ Price at 2xl+ breakpoint

**Actual Results:**
```
Status: [ ]
Font Size:
Width:
Alignment:
Notes:




```

---

#### TEST-4351-008: Price Font Size at 4xl+
**Priority:** Low | **Component:** vc-product-price.vue

**Prerequisites:**
- Container width >= 4xl

**Test Steps:**
1. Set browser to 2560px width
2. Open search with products
3. Check price font size

**Expected Results:**
- [ ] Font size is large (18px)
- [ ] Width is 10.5rem (168px)
- [ ] Price displays clearly

**Screenshot Required:** ✅ Price at 4xl+ breakpoint

**Actual Results:**
```
Status: [ ]
Font Size:
Notes:




```

---

#### TEST-4351-009: Price Variations Label Display
**Priority:** Medium | **Component:** vc-product-price.vue

**Prerequisites:**
- Product with variations/configurable options

**Test Steps:**
1. Search for product with variations
2. Check "variations" label display below 2xl
3. Check "variations" label display at 2xl+

**Expected Results:**
- [ ] Below 2xl: variations label displays inline-block
- [ ] At 2xl+: variations label displays as block
- [ ] Label text is clear and readable
- [ ] Proper spacing around label

**Screenshot Required:** ✅ Variations label at both breakpoints

**Actual Results:**
```
Status: [ ]
Below 2xl Display:
At 2xl+ Display:
Notes:




```

---

### 1.3 Product Button Component

#### TEST-4351-010: Product Button Width Responsive
**Priority:** Medium | **Component:** vc-product-button.vue

**Prerequisites:**
- Product cards with "View Details" or similar buttons

**Test Steps:**
1. Test at mobile width (375px)
2. Test at sm+ breakpoint (640px)
3. Test at 2xl+ breakpoint (1500px)
4. Measure button widths at each breakpoint

**Expected Results:**
- [ ] Default: button width auto or full
- [ ] At sm+: width is 240px (w-60)
- [ ] At 2xl+: width is 10.625rem (170px)
- [ ] Button text not truncated
- [ ] Button remains clickable

**Screenshot Required:** ✅ Button at all three breakpoints

**Actual Results:**
```
Status: [ ]
Width at sm+:
Width at 2xl+:
Notes:




```

---

#### TEST-4351-011: Product Button Link Spacing
**Priority:** Low | **Component:** vc-product-button.vue

**Prerequisites:**
- Product cards with buttons

**Test Steps:**
1. Check button margin-top in list view
2. Check button margin-top in grid view
3. Verify spacing looks balanced

**Expected Results:**
- [ ] List view: mt-3 default (12px)
- [ ] List view at 2xl+: mt-5 (20px)
- [ ] Grid view link: mt-7 (28px)
- [ ] List view link at 2xl+: mt-1.5 (6px)
- [ ] Spacing is visually consistent

**Screenshot Required:** ✅ Spacing in both views

**Actual Results:**
```
Status: [ ]
Notes:




```

---

### 1.4 Product Actions Component

#### TEST-4351-012: Action Icons Size Change at 2xl+
**Priority:** Low | **Component:** vc-product-actions.vue

**Prerequisites:**
- Products with action icons (wishlist, compare, etc.)

**Test Steps:**
1. View product card below 2xl breakpoint
2. View product card at 2xl+ breakpoint
3. Compare icon sizes

**Expected Results:**
- [ ] Icons increase in size at 2xl+ (previously changed at xl)
- [ ] Icons remain proportional
- [ ] Icons don't pixelate or blur
- [ ] Click areas are adequate

**Screenshot Required:** ✅ Icons at both breakpoints

**Actual Results:**
```
Status: [ ]
Icon Size Below 2xl:
Icon Size At 2xl+:
Notes:




```

---

### 1.5 Product Properties Component

#### TEST-4351-013: Properties Visibility at Breakpoints
**Priority:** Medium | **Component:** vc-product-properties.vue

**Prerequisites:**
- Products with properties data

**Test Steps:**
1. View at < 4xl width
2. View at >= 4xl width (2560px)
3. View at >= 5xl width
4. Check properties column visibility

**Expected Results:**
- [ ] Hidden below 4xl in list view
- [ ] Visible at 4xl+ with width 240px (w-60)
- [ ] Width 256px (w-64) at 5xl+
- [ ] Properties display correctly when visible

**Screenshot Required:** ✅ Properties hidden and visible states

**Actual Results:**
```
Status: [ ]
Hidden Below 4xl:
Visible At 4xl+:
Width At 5xl+:
Notes:




```

---

### 1.6 Product Vendor Component

#### TEST-4351-014: Empty Vendor Hidden State
**Priority:** Low | **Component:** vc-product-vendor.vue

**Prerequisites:**
- Mix of products with and without vendor

**Test Steps:**
1. Search for products
2. Find product without vendor
3. Verify vendor element is hidden
4. Find product with vendor
5. Verify vendor displays correctly

**Expected Results:**
- [ ] Products without vendor: vendor element hidden (not just empty)
- [ ] Products with vendor: vendor displays properly
- [ ] No extra spacing for hidden vendor
- [ ] Layout remains consistent

**Screenshot Required:** ✅ Product with and without vendor

**Actual Results:**
```
Status: [ ]
Empty Vendor Hidden:
With Vendor Display:
Notes:




```

---

### 1.7 Product Title Component

#### TEST-4351-015: Title Vertical Alignment
**Priority:** Medium | **Component:** vc-product-title.vue

**Prerequisites:**
- Product cards in list view

**Test Steps:**
1. Open search dropdown with products
2. Inspect title wrapper element
3. Verify flexbox alignment

**Expected Results:**
- [ ] List view wrapper has `flex` class
- [ ] List view wrapper has `items-center` class
- [ ] Title is vertically centered in its area
- [ ] Multi-line titles align properly

**Screenshot Required:** ✅ Title alignment with DevTools

**Actual Results:**
```
Status: [ ]
Flex Applied:
Items-Center Applied:
Notes:




```

---

### 1.8 Add to Cart Component

#### TEST-4351-016: Add to Cart Width Responsive
**Priority:** High | **Component:** vc-add-to-cart.vue

**Prerequisites:**
- Products available for purchase

**Test Steps:**
1. Test add-to-cart button at different widths
2. Check width at sm+ (640px)
3. Check width at 2xl+ (1500px)

**Expected Results:**
- [ ] List view width at sm+: 240px (w-60)
- [ ] List view width at 2xl+: 10.625rem (170px)
- [ ] Button remains clickable
- [ ] Button text not truncated

**Screenshot Required:** ✅ Button at both breakpoints

**Actual Results:**
```
Status: [ ]
Width at sm+:
Width at 2xl+:
Notes:




```

---

#### TEST-4351-017: Badge Margin Update
**Priority:** Low | **Component:** vc-add-to-cart.vue

**Prerequisites:**
- Product with badge/notification

**Test Steps:**
1. Find product with badge on add-to-cart
2. Inspect badge margin

**Expected Results:**
- [ ] Badge margin-top is mt-1 (4px), not mt-1.5
- [ ] Badge doesn't overlap with button
- [ ] Visual spacing looks correct

**Screenshot Required:** ✅ Badge spacing

**Actual Results:**
```
Status: [ ]
Margin Top:
Notes:




```

---

## Section 3: Integration Testing

### 3.1 Search Dropdown Integration

#### TEST-4351-018: Product Cards Render in Search Dropdown
**Priority:** Critical | **Component:** search-dropdown

**Prerequisites:**
- Frontend site accessible
- Products in database

**Test Steps:**
1. Navigate to Frontend home page
2. Click search bar in header
3. Type search query: "product"
4. Wait for dropdown to populate
5. Verify product cards appear

**Expected Results:**
- [ ] Search dropdown opens on input
- [ ] Product cards render in list view mode
- [ ] Cards display correctly formatted
- [ ] Images load properly
- [ ] All product information visible

**Screenshot Required:** ✅ Search dropdown with products

**Actual Results:**
```
Status: [ ]
Cards Rendered:
Layout Correct:
Notes:




```

---

#### TEST-4351-019: Multiple Products in Dropdown
**Priority:** High | **Component:** search-dropdown

**Prerequisites:**
- Search query that returns multiple results

**Test Steps:**
1. Open search bar
2. Type query returning 5+ products
3. Verify all products render
4. Check layout consistency

**Expected Results:**
- [ ] All products render in order
- [ ] Each card has consistent layout
- [ ] Cards are properly spaced
- [ ] No overlapping elements
- [ ] Scrollbar appears if needed

**Screenshot Required:** ✅ Multiple product cards

**Actual Results:**
```
Status: [ ]
Number of Products Shown:
Layout Consistent:
Notes:




```

---

#### TEST-4351-020: Product Card Click Navigation
**Priority:** Critical | **Component:** search-dropdown

**Prerequisites:**
- Search dropdown with products

**Test Steps:**
1. Open search dropdown
2. Click on first product card
3. Verify navigation occurs

**Expected Results:**
- [ ] Clicking card navigates to product page
- [ ] Dropdown closes on click
- [ ] Correct product page loads
- [ ] No JavaScript errors in console

**Screenshot Required:** ✅ Product page after click

**Actual Results:**
```
Status: [ ]
Navigation Successful:
Product Page URL:
Console Errors:
Notes:




```

---

#### TEST-4351-021: Keyboard Navigation in Dropdown
**Priority:** High | **Component:** search-dropdown

**Prerequisites:**
- Search dropdown open with products

**Test Steps:**
1. Open search dropdown
2. Press Tab key to focus first product
3. Press Down Arrow to move to next product
4. Press Up Arrow to move to previous product
5. Press Enter on focused product
6. Verify navigation

**Expected Results:**
- [ ] Tab focuses first product card
- [ ] Arrow keys navigate between cards
- [ ] Focused card has visible focus indicator
- [ ] Enter key navigates to product
- [ ] Focus order is logical

**Screenshot Required:** ✅ Focused product card

**Actual Results:**
```
Status: [ ]
Tab Navigation:
Arrow Keys Work:
Focus Visible:
Enter Navigation:
Notes:




```

---

#### TEST-4351-022: View All Results Button
**Priority:** Medium | **Component:** search-dropdown

**Prerequisites:**
- Search query returning > 8 results

**Test Steps:**
1. Search for common term with many results
2. Check if "View all results" button appears
3. Verify it shows when total > 8
4. Click button and verify behavior

**Expected Results:**
- [ ] Button appears when results > 8
- [ ] Button is clearly visible at bottom
- [ ] Clicking button navigates to full search page
- [ ] Button is keyboard accessible

**Screenshot Required:** ✅ View all results button

**Actual Results:**
```
Status: [ ]
Button Appears:
Total Results:
Button Works:
Notes:




```

---

#### TEST-4351-023: Search Dropdown Loading State
**Priority:** High | **Component:** search-dropdown

**Prerequisites:**
- Network throttling enabled in DevTools (Slow 3G)

**Test Steps:**
1. Open DevTools Network tab
2. Enable network throttling to "Slow 3G"
3. Open search bar and type query
4. Observe loading state

**Expected Results:**
- [ ] Loading indicator shows while fetching
- [ ] Loading state is visually clear
- [ ] Product cards don't flicker
- [ ] Smooth transition from loading to loaded

**Screenshot Required:** ✅ Loading state

**Actual Results:**
```
Status: [ ]
Loading Indicator:
Notes:




```

---

#### TEST-4351-024: Search Dropdown Empty State
**Priority:** Medium | **Component:** search-dropdown

**Prerequisites:**
- Ability to search

**Test Steps:**
1. Open search bar
2. Type query with no results: "xyzabc123notfound"
3. Observe empty state

**Expected Results:**
- [ ] Empty state message displays
- [ ] Message is helpful/informative
- [ ] No broken layouts
- [ ] No console errors

**Screenshot Required:** ✅ Empty state

**Actual Results:**
```
Status: [ ]
Empty State Message:
Notes:




```

---

#### TEST-4351-025: Search Dropdown Scrolling
**Priority:** Medium | **Component:** search-dropdown

**Prerequisites:**
- 8+ products in search results

**Test Steps:**
1. Open search with 8+ results
2. Verify scrollbar appears
3. Scroll through products
4. Check scroll behavior

**Expected Results:**
- [ ] Scrollbar appears for 8+ results
- [ ] Scrolling is smooth
- [ ] Cards remain properly aligned while scrolling
- [ ] Header/footer (if any) remain fixed

**Screenshot Required:** ✅ Scrollable dropdown

**Actual Results:**
```
Status: [ ]
Scrollbar Present:
Scroll Smooth:
Notes:




```

---

## Section 4: Responsive Design Testing

### 4.1 Mobile Viewport Testing

#### TEST-4351-026: Mobile 375px Width
**Priority:** High | **Viewport:** 375x667

**Prerequisites:**
- Chrome DevTools responsive mode

**Test Steps:**
1. Open DevTools (F12)
2. Enable Device Toolbar (Ctrl+Shift+M)
3. Set to 375x667 (iPhone SE)
4. Navigate to site and open search
5. Test all product card interactions

**Expected Results:**
- [ ] Product cards fit within viewport
- [ ] No horizontal scrolling
- [ ] Images scale properly
- [ ] Text is readable
- [ ] Buttons are tap-friendly (min 44x44px)
- [ ] All features accessible

**Screenshot Required:** ✅ Full page at 375px

**Actual Results:**
```
Status: [ ]
Horizontal Scroll:
Touch Targets Adequate:
Notes:




```

---

#### TEST-4351-027: Mobile 414px Width (iPhone)
**Priority:** High | **Viewport:** 414x896

**Prerequisites:**
- Chrome DevTools

**Test Steps:**
1. Set viewport to 414x896 (iPhone 11 Pro Max)
2. Test search dropdown
3. Verify all components work

**Expected Results:**
- [ ] Layout adapts properly
- [ ] Product cards display correctly
- [ ] No truncated content
- [ ] Touch interactions work

**Screenshot Required:** ✅ Product cards at 414px

**Actual Results:**
```
Status: [ ]
Notes:




```

---

#### TEST-4351-028: Tablet 768px Width
**Priority:** High | **Viewport:** 768x1024

**Prerequisites:**
- Chrome DevTools

**Test Steps:**
1. Set viewport to 768x1024 (iPad)
2. Test search functionality
3. Verify responsive layout

**Expected Results:**
- [ ] Cards use appropriate layout for tablet
- [ ] Grid adjusts for screen size
- [ ] Proper spacing maintained
- [ ] Touch targets adequate

**Screenshot Required:** ✅ Product list at 768px

**Actual Results:**
```
Status: [ ]
Notes:




```

---

#### TEST-4351-029: Tablet Landscape 1024px
**Priority:** Medium | **Viewport:** 1024x768

**Prerequisites:**
- Chrome DevTools

**Test Steps:**
1. Set viewport to 1024x768 (iPad landscape)
2. Test product cards
3. Verify layout transitions

**Expected Results:**
- [ ] Layout takes advantage of width
- [ ] Cards display in appropriate grid
- [ ] No wasted space
- [ ] Content well balanced

**Screenshot Required:** ✅ Landscape layout

**Actual Results:**
```
Status: [ ]
Notes:




```

---

### 4.2 Desktop Viewport Testing

#### TEST-4351-030: Desktop 1280px Width
**Priority:** High | **Viewport:** 1280x720

**Prerequisites:**
- Standard desktop resolution

**Test Steps:**
1. Set browser to 1280x720
2. Test all features
3. Verify desktop layout

**Expected Results:**
- [ ] Full desktop layout displays
- [ ] Proper use of screen space
- [ ] Multi-column layout where appropriate
- [ ] Images at good quality

**Screenshot Required:** ✅ Desktop layout 1280px

**Actual Results:**
```
Status: [ ]
Notes:




```

---

#### TEST-4351-031: Desktop 1440px Width
**Priority:** High | **Viewport:** 1440x900

**Prerequisites:**
- Common desktop resolution

**Test Steps:**
1. Set viewport to 1440x900
2. Test product cards
3. Verify 2xl breakpoint behavior

**Expected Results:**
- [ ] Layout optimized for 1440px
- [ ] 2xl breakpoint styles apply
- [ ] No excessive white space
- [ ] All features functional

**Screenshot Required:** ✅ 1440px layout

**Actual Results:**
```
Status: [ ]
Notes:




```

---

#### TEST-4351-032: Full HD 1920px Width
**Priority:** Medium | **Viewport:** 1920x1080

**Prerequisites:**
- Full HD resolution

**Test Steps:**
1. Set viewport to 1920x1080
2. Test full layout
3. Check content centering

**Expected Results:**
- [ ] Content properly centered or aligned
- [ ] No excessive stretching
- [ ] Images maintain quality
- [ ] Layout looks professional

**Screenshot Required:** ✅ Full HD layout

**Actual Results:**
```
Status: [ ]
Notes:




```

---

#### TEST-4351-033: Ultra-Wide 2560px Width
**Priority:** Low | **Viewport:** 2560x1440

**Prerequisites:**
- Ultra-wide display or browser zoom

**Test Steps:**
1. Set viewport to 2560x1440
2. Test 4xl+ breakpoint features
3. Verify properties column visibility

**Expected Results:**
- [ ] 4xl breakpoint styles apply
- [ ] Properties column visible
- [ ] 5-column grid layout (if applicable)
- [ ] No layout breaking
- [ ] Content doesn't stretch excessively

**Screenshot Required:** ✅ Ultra-wide with properties

**Actual Results:**
```
Status: [ ]
Properties Visible:
Layout Columns:
Notes:




```

---

### 4.3 Container Query Testing

#### TEST-4351-034: Container Query vs Viewport Query
**Priority:** Critical | **Component:** Product Card

**Prerequisites:**
- Understanding of container queries
- DevTools inspection capability

**Test Steps:**
1. Open product cards in narrow container (<1500px) on wide viewport
2. Verify cards respond to container size, not viewport
3. Compare with wider container on same viewport
4. Test at 2xl, 4xl container widths

**Expected Results:**
- [ ] Cards respond to container width, NOT viewport width
- [ ] 2xl breakpoint = 1500px container width
- [ ] 4xl breakpoint shows properties column
- [ ] Layout changes with container, not viewport

**Screenshot Required:** ✅ Narrow container on wide viewport

**Actual Results:**
```
Status: [ ]
Container Query Working:
Breakpoint Triggers at Container Size:
Notes:




```

---

## Section 5: Accessibility Testing

### 5.1 Keyboard Navigation

#### TEST-4351-035: Tab Navigation Through Product Cards
**Priority:** Critical | **WCAG:** 2.1.1 Level A

**Prerequisites:**
- Keyboard only (no mouse)

**Test Steps:**
1. Navigate to search dropdown with products
2. Press Tab repeatedly to move through cards
3. Verify tab order is logical
4. Check all interactive elements are reachable

**Expected Results:**
- [ ] All interactive elements reachable by Tab
- [ ] Tab order is logical (top to bottom, left to right)
- [ ] No keyboard traps
- [ ] Shift+Tab works in reverse

**Screenshot Required:** ✅ Focus indicators visible

**Actual Results:**
```
Status: [ ]
Tab Order Logical:
All Elements Reachable:
Notes:




```

---

#### TEST-4351-036: Focus Indicators Visible
**Priority:** Critical | **WCAG:** 2.4.7 Level AA

**Prerequisites:**
- Keyboard navigation

**Test Steps:**
1. Tab through all product card elements
2. Verify focus indicator on each element
3. Check contrast of focus indicators
4. Test in different themes (if applicable)

**Expected Results:**
- [ ] Focus indicator visible on all interactive elements
- [ ] Focus indicator has adequate contrast (3:1 minimum)
- [ ] Focus indicator doesn't obscure content
- [ ] Focus style is consistent across components

**Screenshot Required:** ✅ Focus indicators on various elements

**Actual Results:**
```
Status: [ ]
Indicators Visible:
Contrast Adequate:
Notes:




```

---

#### TEST-4351-037: Arrow Key Navigation in Search
**Priority:** High | **WCAG:** 2.1.1 Level A

**Prerequisites:**
- Search dropdown open

**Test Steps:**
1. Open search dropdown
2. Use Down Arrow to navigate products
3. Use Up Arrow to navigate back
4. Try Home/End keys
5. Try Page Up/Page Down (if applicable)

**Expected Results:**
- [ ] Down Arrow moves to next product
- [ ] Up Arrow moves to previous product
- [ ] Focus wraps or stops at boundaries appropriately
- [ ] Visual indicator shows focused item

**Screenshot Required:** ✅ Arrow key focused item

**Actual Results:**
```
Status: [ ]
Arrow Navigation Works:
Notes:




```

---

#### TEST-4351-038: Escape Key Closes Dropdown
**Priority:** High | **WCAG:** 2.1.1 Level A

**Prerequisites:**
- Search dropdown open

**Test Steps:**
1. Open search dropdown
2. Press Escape key
3. Verify dropdown closes
4. Check focus returns to search input

**Expected Results:**
- [ ] Escape closes dropdown
- [ ] Focus returns to search input (or logical location)
- [ ] No JavaScript errors
- [ ] Can reopen dropdown after closing

**Screenshot Required:** Optional

**Actual Results:**
```
Status: [ ]
Dropdown Closes:
Focus Returns:
Notes:




```

---

#### TEST-4351-039: Enter Key Activates Product Link
**Priority:** Critical | **WCAG:** 2.1.1 Level A

**Prerequisites:**
- Search dropdown with focused product

**Test Steps:**
1. Tab to product card
2. Press Enter key
3. Verify navigation occurs

**Expected Results:**
- [ ] Enter key activates product link
- [ ] Navigates to correct product page
- [ ] Same behavior as mouse click

**Screenshot Required:** Optional

**Actual Results:**
```
Status: [ ]
Enter Activates Link:
Navigation Successful:
Notes:




```

---

### 5.2 Screen Reader Testing

#### TEST-4351-040: Product Card Accessibility Tree
**Priority:** High | **WCAG:** 4.1.2 Level A

**Prerequisites:**
- Chrome DevTools Accessibility tab

**Test Steps:**
1. Open search dropdown
2. Open DevTools → Accessibility tab
3. Inspect product card accessibility tree
4. Verify proper role, name, value for all elements

**Expected Results:**
- [ ] Product card has appropriate role (article/listitem)
- [ ] Product title has accessible name
- [ ] Product image has alt text
- [ ] Price information is in accessibility tree
- [ ] Buttons have accessible names
- [ ] Vendor information is accessible

**Screenshot Required:** ✅ Accessibility tree in DevTools

**Actual Results:**
```
Status: [ ]
Roles Appropriate:
Names Present:
Notes:




```

---

#### TEST-4351-041: Image Alt Text
**Priority:** Critical | **WCAG:** 1.1.1 Level A

**Prerequisites:**
- Products with images

**Test Steps:**
1. Inspect product image elements
2. Check alt attribute presence
3. Verify alt text is descriptive
4. Test with images disabled

**Expected Results:**
- [ ] All product images have alt attribute
- [ ] Alt text is descriptive (product name minimum)
- [ ] Alt text not empty or "image"
- [ ] Decorative images have alt=""

**Screenshot Required:** ✅ Image alt in DevTools

**Actual Results:**
```
Status: [ ]
Alt Attributes Present:
Alt Text Quality:
Notes:




```

---

#### TEST-4351-042: ARIA Labels on Interactive Elements
**Priority:** High | **WCAG:** 4.1.2 Level A

**Prerequisites:**
- Product cards with buttons/links

**Test Steps:**
1. Inspect all interactive elements
2. Check for aria-label or aria-labelledby
3. Verify labels are descriptive
4. Check wishlist, compare, add-to-cart buttons

**Expected Results:**
- [ ] All buttons have accessible labels
- [ ] Icon buttons have aria-label
- [ ] Labels describe the action
- [ ] Labels include product context if needed

**Screenshot Required:** ✅ ARIA labels in DevTools

**Actual Results:**
```
Status: [ ]
ARIA Labels Present:
Labels Descriptive:
Notes:




```

---

#### TEST-4351-043: Price Information Accessibility
**Priority:** Medium | **WCAG:** 1.3.1 Level A

**Prerequisites:**
- Products with prices

**Test Steps:**
1. Inspect price elements
2. Check if price has proper semantic markup
3. Verify currency is announced
4. Test with variations pricing

**Expected Results:**
- [ ] Price has semantic markup (e.g., <span role="text">)
- [ ] Currency symbol/code is present
- [ ] "From" pricing clearly indicated
- [ ] Sale/original prices distinguishable

**Screenshot Required:** ✅ Price markup

**Actual Results:**
```
Status: [ ]
Price Accessible:
Notes:




```

---

### 5.3 Color Contrast Testing

#### TEST-4351-044: Text Contrast Ratios
**Priority:** Critical | **WCAG:** 1.4.3 Level AA

**Prerequisites:**
- Chrome DevTools or color contrast tool

**Test Steps:**
1. Open DevTools → Elements → Styles
2. Inspect product title text
3. Check contrast ratio (4.5:1 for normal text)
4. Check price text contrast
5. Check vendor text contrast
6. Check button text contrast

**Expected Results:**
- [ ] Product title: contrast ≥ 4.5:1
- [ ] Price text: contrast ≥ 4.5:1
- [ ] Vendor text: contrast ≥ 4.5:1
- [ ] Button text: contrast ≥ 4.5:1
- [ ] Large text (18pt+): contrast ≥ 3:1

**Screenshot Required:** ✅ Contrast ratios in DevTools

**Actual Results:**
```
Status: [ ]
Title Contrast:
Price Contrast:
Vendor Contrast:
Button Contrast:
Notes:




```

---

#### TEST-4351-045: Link Color Contrast
**Priority:** High | **WCAG:** 1.4.3 Level AA

**Prerequisites:**
- Product cards with links

**Test Steps:**
1. Identify all links in product card
2. Check link color contrast against background
3. Verify link is distinguishable from regular text
4. Test hover/focus states

**Expected Results:**
- [ ] Links have contrast ≥ 4.5:1
- [ ] Links visually distinct from body text
- [ ] Hover state has adequate contrast
- [ ] Focus state has adequate contrast

**Screenshot Required:** ✅ Link colors

**Actual Results:**
```
Status: [ ]
Link Contrast:
Distinguishable:
Notes:




```

---

#### TEST-4351-046: Focus Indicator Contrast
**Priority:** High | **WCAG:** 1.4.11 Level AA

**Prerequisites:**
- Keyboard navigation

**Test Steps:**
1. Tab through interactive elements
2. Check focus indicator color
3. Measure contrast against background
4. Test on different backgrounds

**Expected Results:**
- [ ] Focus indicator contrast ≥ 3:1
- [ ] Visible against all background colors
- [ ] Indicator thickness at least 2px

**Screenshot Required:** ✅ Focus indicator contrast

**Actual Results:**
```
Status: [ ]
Contrast Ratio:
Notes:




```

---

### 5.4 Automated Accessibility Testing

#### TEST-4351-047: axe DevTools Scan
**Priority:** High | **WCAG:** Multiple

**Prerequisites:**
- axe DevTools extension installed

**Test Steps:**
1. Install axe DevTools Chrome extension
2. Open search dropdown with products
3. Run axe scan
4. Review all violations
5. Check severity levels

**Expected Results:**
- [ ] Zero critical violations
- [ ] Zero serious violations
- [ ] Moderate/minor issues documented
- [ ] Best practices noted

**Screenshot Required:** ✅ axe results summary

**Actual Results:**
```
Status: [ ]
Critical Violations:
Serious Violations:
Moderate Violations:
Notes:




```

---

#### TEST-4351-048: Lighthouse Accessibility Score
**Priority:** Medium | **Tool:** Lighthouse

**Prerequisites:**
- Chrome DevTools Lighthouse tab

**Test Steps:**
1. Open product listing page or search
2. Open DevTools → Lighthouse
3. Select "Accessibility" only
4. Run audit
5. Review score and issues

**Expected Results:**
- [ ] Accessibility score ≥ 90
- [ ] All issues addressed or documented
- [ ] No major accessibility blockers

**Screenshot Required:** ✅ Lighthouse report

**Actual Results:**
```
Status: [ ]
Accessibility Score:
Issues Found:
Notes:




```

---

## Section 6: Cross-Browser Testing

### 6.1 Chromium Browsers

#### TEST-4351-049: Google Chrome (Latest)
**Priority:** Critical | **Browser:** Chrome

**Prerequisites:**
- Latest Chrome version installed

**Test Steps:**
1. Open site in Chrome
2. Test all features from Sections 1, 3, 4
3. Check console for errors
4. Verify layout consistency
5. Test all breakpoints

**Expected Results:**
- [ ] All features work correctly
- [ ] Layout renders properly
- [ ] No console errors
- [ ] Container queries work
- [ ] Smooth interactions

**Screenshot Required:** ✅ Product cards in Chrome

**Actual Results:**
```
Status: [ ]
Chrome Version:
Issues Found:
Notes:




```

---

#### TEST-4351-050: Microsoft Edge (Latest)
**Priority:** High | **Browser:** Edge

**Prerequisites:**
- Latest Edge version

**Test Steps:**
1. Open site in Edge
2. Test all core features
3. Compare to Chrome behavior
4. Check for Edge-specific issues

**Expected Results:**
- [ ] Behavior identical to Chrome
- [ ] Layout consistent
- [ ] No Edge-specific bugs
- [ ] Container queries supported

**Screenshot Required:** ✅ Product cards in Edge

**Actual Results:**
```
Status: [ ]
Edge Version:
Differences from Chrome:
Notes:




```

---

### 6.2 Firefox

#### TEST-4351-051: Mozilla Firefox (Latest)
**Priority:** Critical | **Browser:** Firefox

**Prerequisites:**
- Latest Firefox version

**Test Steps:**
1. Open site in Firefox
2. Test all features
3. Check for rendering differences
4. Verify container queries work
5. Test all breakpoints

**Expected Results:**
- [ ] All features functional
- [ ] Layout matches Chrome/Edge
- [ ] Container queries work correctly
- [ ] No Firefox-specific bugs
- [ ] Console error-free

**Screenshot Required:** ✅ Product cards in Firefox

**Actual Results:**
```
Status: [ ]
Firefox Version:
Rendering Differences:
Issues Found:
Notes:




```

---

### 6.3 Safari/WebKit

#### TEST-4351-052: Safari (Latest - macOS)
**Priority:** High | **Browser:** Safari

**Prerequisites:**
- Safari on macOS (or BrowserStack)

**Test Steps:**
1. Open site in Safari
2. Test all features
3. Check container query support
4. Verify WebKit-specific rendering
5. Test iOS if available

**Expected Results:**
- [ ] Features work in Safari
- [ ] Container queries supported (Safari 16+)
- [ ] Layout consistent with other browsers
- [ ] Touch interactions work on iOS
- [ ] No WebKit-specific bugs

**Screenshot Required:** ✅ Product cards in Safari

**Actual Results:**
```
Status: [ ]
Safari Version:
Container Query Support:
Issues Found:
Notes:




```

---

### 6.4 Mobile Browsers

#### TEST-4351-053: Chrome Mobile (Android)
**Priority:** High | **Browser:** Chrome Mobile

**Prerequisites:**
- Android device or emulator

**Test Steps:**
1. Open site on Android Chrome
2. Test touch interactions
3. Verify responsive layout
4. Test search dropdown on mobile
5. Check performance

**Expected Results:**
- [ ] Touch interactions smooth
- [ ] Layout responsive
- [ ] Search works properly
- [ ] No horizontal scrolling
- [ ] Performance acceptable

**Screenshot Required:** ✅ Mobile Chrome layout

**Actual Results:**
```
Status: [ ]
Device:
Android Version:
Chrome Version:
Issues:
Notes:




```

---

#### TEST-4351-054: Mobile Safari (iOS)
**Priority:** High | **Browser:** Safari Mobile

**Prerequisites:**
- iOS device (iPhone/iPad)

**Test Steps:**
1. Open site on iOS Safari
2. Test all touch interactions
3. Verify layout on iPhone and iPad
4. Check for iOS-specific issues
5. Test in portrait and landscape

**Expected Results:**
- [ ] Touch targets adequate (44x44px)
- [ ] No iOS-specific bugs
- [ ] Layout adapts to orientation
- [ ] Scrolling smooth
- [ ] Search dropdown works

**Screenshot Required:** ✅ iOS Safari layout

**Actual Results:**
```
Status: [ ]
Device:
iOS Version:
Issues:
Notes:




```

---

## Section 7: Performance Testing

### 7.1 Render Performance

#### TEST-4351-055: Initial Render Performance
**Priority:** Medium | **Tool:** Chrome DevTools Performance

**Prerequisites:**
- Chrome DevTools

**Test Steps:**
1. Open DevTools → Performance tab
2. Start recording
3. Open search dropdown with 8 products
4. Stop recording
5. Analyze render time

**Expected Results:**
- [ ] Product cards render in < 100ms
- [ ] No long tasks (> 50ms)
- [ ] Smooth frame rate (60fps)
- [ ] No layout thrashing

**Screenshot Required:** ✅ Performance timeline

**Actual Results:**
```
Status: [ ]
Render Time:
Long Tasks:
Frame Rate:
Notes:




```

---

#### TEST-4351-056: Layout Shift (CLS)
**Priority:** High | **Metric:** Cumulative Layout Shift

**Prerequisites:**
- Chrome DevTools

**Test Steps:**
1. Open search dropdown
2. Monitor for layout shifts
3. Check images loading behavior
4. Measure CLS in Lighthouse

**Expected Results:**
- [ ] CLS score < 0.1 (good)
- [ ] No layout shifts after initial render
- [ ] Images have width/height attributes
- [ ] Skeleton/placeholder prevents shift

**Screenshot Required:** ✅ Layout shift timeline

**Actual Results:**
```
Status: [ ]
CLS Score:
Layout Shifts Detected:
Notes:




```

---

#### TEST-4351-057: Smooth Transitions
**Priority:** Low | **Component:** All

**Test Steps:**
1. Open search dropdown
2. Test hover effects
3. Test focus transitions
4. Observe visual smoothness

**Expected Results:**
- [ ] Hover effects smooth
- [ ] Focus transitions smooth
- [ ] No jarring animations
- [ ] Transitions < 300ms

**Screenshot Required:** Optional

**Actual Results:**
```
Status: [ ]
Notes:




```

---

### 7.2 CSS Performance

#### TEST-4351-058: CSS Variables Update
**Priority:** Low | **Component:** vc-product-price

**Prerequisites:**
- DevTools inspection

**Test Steps:**
1. Inspect price element
2. Check CSS variable usage
3. Verify fallback values work
4. Test variable updates (if applicable)

**Expected Results:**
- [ ] CSS variables apply correctly
- [ ] Fallback values work
- [ ] No FOUC (Flash of Unstyled Content)
- [ ] Variables update efficiently

**Screenshot Required:** ✅ CSS variables in DevTools

**Actual Results:**
```
Status: [ ]
Variables Working:
Notes:




```

---

#### TEST-4351-059: Container Query Performance
**Priority:** Medium | **Feature:** Container Queries

**Prerequisites:**
- Browser with container query support

**Test Steps:**
1. Resize browser window repeatedly
2. Observe container query transitions
3. Check for layout reflows
4. Monitor performance

**Expected Results:**
- [ ] Container queries don't cause excessive reflows
- [ ] Smooth transitions between breakpoints
- [ ] No performance degradation
- [ ] CPU usage reasonable

**Screenshot Required:** Optional

**Actual Results:**
```
Status: [ ]
Performance Impact:
Notes:




```

---

### 7.3 Memory Testing

#### TEST-4351-060: Memory Leaks - Search Dropdown
**Priority:** Medium | **Tool:** Chrome DevTools Memory

**Prerequisites:**
- Chrome DevTools

**Test Steps:**
1. Open DevTools → Memory tab
2. Take heap snapshot
3. Open/close search dropdown 20 times
4. Take another heap snapshot
5. Compare memory usage

**Expected Results:**
- [ ] No significant memory increase
- [ ] Detached DOM nodes cleaned up
- [ ] Event listeners removed
- [ ] Memory returns to baseline

**Screenshot Required:** ✅ Memory comparison

**Actual Results:**
```
Status: [ ]
Initial Memory:
Final Memory:
Memory Leak:
Notes:




```

---

## Section 8: Edge Cases Testing

### 8.1 Data Edge Cases

#### TEST-4351-061: Product with No Image
**Priority:** High | **Component:** Product Card

**Prerequisites:**
- Product without image or broken image URL

**Test Steps:**
1. Find or create product without image
2. View in search results
3. Verify placeholder or fallback displays

**Expected Results:**
- [ ] Placeholder image shows
- [ ] Layout doesn't break
- [ ] Image area maintains correct size
- [ ] No broken image icon

**Screenshot Required:** ✅ Product without image

**Actual Results:**
```
Status: [ ]
Placeholder Shows:
Notes:




```

---

#### TEST-4351-062: Product with Very Long Title
**Priority:** High | **Component:** Product Title

**Prerequisites:**
- Product with title > 100 characters

**Test Steps:**
1. Create/find product with long title
2. View in search results
3. Check at different breakpoints
4. Verify text handling

**Expected Results:**
- [ ] Title wraps to multiple lines (2-3 max)
- [ ] Text doesn't overflow container
- [ ] Ellipsis used if needed
- [ ] Tooltip shows full title on hover (if truncated)

**Screenshot Required:** ✅ Long title handling

**Actual Results:**
```
Status: [ ]
Lines Wrapped:
Truncation Behavior:
Notes:




```

---

#### TEST-4351-063: Product with No Vendor
**Priority:** Medium | **Component:** Product Vendor

**Prerequisites:**
- Product without vendor assigned

**Test Steps:**
1. View product without vendor
2. Verify vendor element is hidden
3. Check layout remains correct

**Expected Results:**
- [ ] Vendor section is hidden (not just empty)
- [ ] No extra spacing for vendor
- [ ] Grid layout adjusts properly
- [ ] No placeholder text shows

**Screenshot Required:** ✅ Product without vendor

**Actual Results:**
```
Status: [ ]
Vendor Hidden:
Layout Correct:
Notes:




```

---

#### TEST-4351-064: Product with No Price
**Priority:** High | **Component:** Product Price

**Prerequisites:**
- Product without price (contact for price)

**Test Steps:**
1. View product without price
2. Check if "Contact for price" or similar shows
3. Verify layout handling

**Expected Results:**
- [ ] Appropriate message displays
- [ ] Layout doesn't break
- [ ] Add-to-cart button hidden or shows "Contact"
- [ ] Price area maintains size

**Screenshot Required:** ✅ Product without price

**Actual Results:**
```
Status: [ ]
Message Displays:
Notes:




```

---

#### TEST-4351-065: Product with Variations
**Priority:** High | **Component:** Product Price

**Prerequisites:**
- Configurable product with variations

**Test Steps:**
1. View product with variations
2. Check price display (from $X.XX)
3. Verify variations label
4. Test at different breakpoints

**Expected Results:**
- [ ] "From" price displays correctly
- [ ] Variations label shows
- [ ] Layout handles variations label properly
- [ ] Price format consistent

**Screenshot Required:** ✅ Product with variations

**Actual Results:**
```
Status: [ ]
Price Display:
Variations Label:
Notes:




```

---

#### TEST-4351-066: Product with Special Characters in Name
**Priority:** Medium | **Component:** Product Title

**Prerequisites:**
- Product with special chars (& < > " ' / \)

**Test Steps:**
1. Create product with special characters
2. View in search results
3. Verify proper encoding/escaping

**Expected Results:**
- [ ] Special characters display correctly
- [ ] No HTML injection
- [ ] No layout breaking
- [ ] Characters properly escaped

**Screenshot Required:** ✅ Special characters

**Actual Results:**
```
Status: [ ]
Characters Display Correctly:
Notes:




```

---

#### TEST-4351-067: Product with Long Description
**Priority:** Low | **Component:** Product Card

**Prerequisites:**
- Product with lengthy description

**Test Steps:**
1. View product with long description
2. Check if description shows in list view
3. Verify truncation behavior

**Expected Results:**
- [ ] Description truncated appropriately
- [ ] Doesn't affect layout
- [ ] Ellipsis used if needed
- [ ] Full description available on product page

**Screenshot Required:** Optional

**Actual Results:**
```
Status: [ ]
Notes:




```

---

### 8.2 Layout Edge Cases

#### TEST-4351-068: Single Product in Search
**Priority:** Medium | **Component:** Search Dropdown

**Prerequisites:**
- Unique search query

**Test Steps:**
1. Search for term returning exactly 1 product
2. Verify dropdown displays correctly
3. Check layout doesn't look broken

**Expected Results:**
- [ ] Single product displays properly
- [ ] No "empty" appearance
- [ ] Dropdown sized appropriately
- [ ] "View all" button doesn't show

**Screenshot Required:** ✅ Single product

**Actual Results:**
```
Status: [ ]
Notes:




```

---

#### TEST-4351-069: Maximum Products (8) in Dropdown
**Priority:** High | **Component:** Search Dropdown

**Prerequisites:**
- Search returning 8+ products

**Test Steps:**
1. Search for common term
2. Verify 8 products show (if limit is 8)
3. Check scrolling behavior
4. Verify "View all" button

**Expected Results:**
- [ ] Exactly 8 products show
- [ ] Scrollbar appears
- [ ] "View all" button visible
- [ ] Layout remains stable

**Screenshot Required:** ✅ 8 products with scrollbar

**Actual Results:**
```
Status: [ ]
Products Shown:
View All Button:
Notes:




```

---

#### TEST-4351-070: Rapid Search Query Changes
**Priority:** Medium | **Component:** Search Dropdown

**Prerequisites:**
- Fast typing ability

**Test Steps:**
1. Type search query quickly
2. Delete and type new query immediately
3. Repeat several times
4. Observe dropdown behavior

**Expected Results:**
- [ ] Dropdown updates correctly
- [ ] No flickering
- [ ] No stale results shown
- [ ] No JavaScript errors
- [ ] Loading states handled properly

**Screenshot Required:** Optional

**Actual Results:**
```
Status: [ ]
Console Errors:
Visual Issues:
Notes:




```

---

#### TEST-4351-071: Search Dropdown Resize During Display
**Priority:** Low | **Component:** Search Dropdown

**Prerequisites:**
- Search dropdown open

**Test Steps:**
1. Open search dropdown
2. Resize browser window while dropdown open
3. Test across breakpoints
4. Verify dropdown adapts

**Expected Results:**
- [ ] Dropdown resizes smoothly
- [ ] Layout adapts to new size
- [ ] No content overflow
- [ ] Dropdown remains usable

**Screenshot Required:** Optional

**Actual Results:**
```
Status: [ ]
Notes:




```

---

## Section 9: Regression Testing

### 9.1 Existing Functionality

#### TEST-4351-072: Grid View Still Works
**Priority:** Critical | **Component:** Product Card Grid

**Prerequisites:**
- Product listing page with grid view

**Test Steps:**
1. Navigate to product catalog/category page
2. Verify products display in grid view
3. Check grid layout unchanged
4. Verify all grid features work

**Expected Results:**
- [ ] Grid view renders correctly
- [ ] Grid layout unchanged from before PR
- [ ] Padding p-5 default, p-6 at xs+
- [ ] All features functional
- [ ] No regressions

**Screenshot Required:** ✅ Grid view

**Actual Results:**
```
Status: [ ]
Grid Works:
Changes Noticed:
Notes:




```

---

#### TEST-4351-073: Item View (Cart) Works
**Priority:** Critical | **Component:** Product Card Item View

**Prerequisites:**
- Shopping cart with products

**Test Steps:**
1. Add products to cart
2. View cart page
3. Verify product cards in item view
4. Check layout and functionality

**Expected Results:**
- [ ] Item view renders in cart
- [ ] Layout unchanged
- [ ] Quantity controls work
- [ ] Remove button works
- [ ] Prices update correctly

**Screenshot Required:** ✅ Cart item view

**Actual Results:**
```
Status: [ ]
Item View Works:
Issues Found:
Notes:




```

---

#### TEST-4351-074: Catalog Page Product Cards
**Priority:** Critical | **Component:** Product Card

**Prerequisites:**
- Product catalog page

**Test Steps:**
1. Navigate to category page
2. Verify product cards render
3. Check for any visual changes
4. Test all interactions

**Expected Results:**
- [ ] Product cards unchanged in catalog
- [ ] Grid layout same as before
- [ ] All features work
- [ ] No unintended changes

**Screenshot Required:** ✅ Catalog page

**Actual Results:**
```
Status: [ ]
Unchanged:
Issues:
Notes:




```

---

#### TEST-4351-075: Related Products Section
**Priority:** High | **Component:** Product Card

**Prerequisites:**
- Product detail page with related products

**Test Steps:**
1. Navigate to product detail page
2. Scroll to related products section
3. Verify product cards display
4. Check for changes

**Expected Results:**
- [ ] Related products show correctly
- [ ] Layout unchanged
- [ ] Cards clickable
- [ ] No regressions

**Screenshot Required:** ✅ Related products

**Actual Results:**
```
Status: [ ]
Notes:




```

---

#### TEST-4351-076: Wishlist Product Cards
**Priority:** Medium | **Component:** Product Card

**Prerequisites:**
- User account with wishlist items

**Test Steps:**
1. Add products to wishlist
2. Navigate to wishlist page
3. Verify product cards display
4. Test remove functionality

**Expected Results:**
- [ ] Wishlist cards unchanged
- [ ] Remove button works
- [ ] "Add to cart" works
- [ ] No layout issues

**Screenshot Required:** ✅ Wishlist

**Actual Results:**
```
Status: [ ]
Notes:




```

---

### 9.2 Component API Validation

#### TEST-4351-077: Props Interface Unchanged
**Priority:** High | **Component:** All Components

**Prerequisites:**
- Access to component source or documentation

**Test Steps:**
1. Review component props
2. Compare with previous version
3. Verify no breaking changes
4. Test all prop combinations

**Expected Results:**
- [ ] No props removed
- [ ] No prop types changed
- [ ] New props are optional
- [ ] Defaults maintained

**Verification Method:** Code review

**Actual Results:**
```
Status: [ ]
Breaking Changes:
Notes:




```

---

#### TEST-4351-078: Events Interface Unchanged
**Priority:** High | **Component:** All Components

**Prerequisites:**
- Component documentation

**Test Steps:**
1. Review emitted events
2. Compare with previous version
3. Test event payloads
4. Verify no breaking changes

**Expected Results:**
- [ ] All events still emitted
- [ ] Event payloads unchanged
- [ ] Event names unchanged
- [ ] Event timing unchanged

**Verification Method:** Code review + testing

**Actual Results:**
```
Status: [ ]
Breaking Changes:
Notes:




```

---

#### TEST-4351-079: Slot Structure Unchanged
**Priority:** Medium | **Component:** Product Card

**Prerequisites:**
- Component source code

**Test Steps:**
1. Review component slots
2. Compare with previous version
3. Test slot content rendering
4. Verify customization works

**Expected Results:**
- [ ] All slots still available
- [ ] Slot names unchanged
- [ ] Slot scope unchanged
- [ ] Custom content renders correctly

**Verification Method:** Code review

**Actual Results:**
```
Status: [ ]
Changes Detected:
Notes:




```

---

## Test Summary Template

### Test Execution Summary

**Tested By:** _______________
**Date:** _______________
**Total Test Cases:** 79
**Test Cases Executed:** _______________

**Results:**
- ✅ Passed: _______________
- ❌ Failed: _______________
- ⚠️ Blocked: _______________
- ⏭️ Skipped: _______________

**Critical Issues Found:** _______________
**High Priority Issues:** _______________
**Medium Priority Issues:** _______________
**Low Priority Issues:** _______________

**Overall Status:** [ ] PASS [ ] FAIL [ ] NEEDS REVIEW

**Recommendation:**
[ ] Approve for production
[ ] Approve with minor fixes
[ ] Reject - major issues found
[ ] More testing needed

**Notes:**
```




```

---

## Appendix A: Browser Configuration

### Chrome/Edge DevTools Setup
1. Open DevTools (F12)
2. Enable Device Toolbar (Ctrl+Shift+M)
3. Open Network tab for performance testing
4. Install axe DevTools extension
5. Enable responsive design mode

### Firefox DevTools Setup
1. Open DevTools (F12)
2. Enable Responsive Design Mode (Ctrl+Shift+M)
3. Install Firefox accessibility inspector
4. Enable layout debugging tools

### Mobile Testing Setup
1. Enable USB debugging on Android device
2. Connect via Chrome remote debugging
3. For iOS: Enable Web Inspector in Settings
4. Use Safari Technology Preview for latest features

---

## Appendix B: Common Issues Checklist

**If test fails, check:**
- [ ] Browser version is up to date
- [ ] Clear browser cache and cookies
- [ ] Disable browser extensions
- [ ] Check network connectivity
- [ ] Verify test data exists
- [ ] Check console for JavaScript errors
- [ ] Verify correct environment URL
- [ ] Check if issue is reproducible
- [ ] Test in incognito/private mode
- [ ] Document browser version and OS

---

## Appendix C: Evidence Collection Guide

**For each failed test, collect:**
1. Screenshot of the issue
2. Browser console errors (F12 → Console)
3. Network errors (F12 → Network)
4. Browser and OS version
5. Steps to reproduce
6. Expected vs actual behavior
7. Screen recording if interaction issue

**Screenshot Naming Convention:**
`VCST-4351-{TEST-ID}-{description}-{PASS|FAIL}.png`

Example: `VCST-4351-001-list-view-layout-PASS.png`

**Save screenshots in:**
`tests/VCST-4351/screenshots/`

---

**End of Manual Testing Checklist**

*This checklist covers all testing sections except Section 2 (Visual Regression/Storybook Stories) as requested.*
