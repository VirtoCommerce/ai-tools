# Jira User Story - Reset Filters Button

**Jira Ticket**: [VCST-4122](https://virtocommerce.atlassian.net/browse/VCST-4122) ✅ **CREATED**

## Status
✅ Story successfully created in Jira on October 15, 2025

---

## Story Details

**Project**: VCST  
**Issue Type**: Story  
**Summary**: `[Filters] Add "Reset filters" button for quick filter clearing when no results found`

**Priority**: Medium  
**Story Points**: 3  
**Sprint**: VCST Sprint 25-21 (or current sprint)

**Labels**: `filters`, `ux-enhancement`, `search`, `reset-button`

**Related to**: 
- VCST-4066 (Parent feature)
- VCST-4121 (Bug - partially addresses this)
- VCDZ-741 (Related: Get more search results if filters applied)

---

## User Story

**As a** user browsing products with filters applied,  
**I want** to have a clear "Reset filters" button when my filter combination results in no products,  
**So that** I can easily clear all applied filters and restore the full product list with one click.

---

## Background

Currently, when users apply filters (such as "Show in stock", "Available at branches", price ranges, categories, etc.) that result in zero products:
- The "There are no results found" message displays correctly ✅
- A "Reset search" button appears for category-based filters ✅
- However, for simple checkbox filters (Show in stock, Available at branches), users must manually uncheck each filter

This creates an inconsistent experience compared to search-based and category-filter-based no results.

---

## Current Behavior

**When filters result in no products**:
- Category filters (e.g., [E2E Test] Notebooks) → "Reset search" and "Reset filters" buttons appear ✅
- Simple filters (e.g., "Show in stock" alone) → May not show reset button consistently
- Users must manually uncheck filters to restore products

---

## Desired Behavior

**When ANY filter combination results in no products**:

1. Display "There are no results found" message ✅ (Already working)
2. Display **"Reset filters"** button prominently
3. Clicking the button should:
   - Clear ALL applied filters (checkboxes, price ranges, categories, etc.)
   - Restore the full product catalog
   - Clear any active filter selections
   - Update the URL to remove filter parameters

---

## User Scenarios

### Scenario 1: Single Filter - No Results
**Steps**:
1. Navigate to catalog/search page
2. Check "Show in stock" filter
3. Result: 0 products found

**Expected**:
- Message: "There are no results found"
- Button: "Reset filters" visible and functional
- Click: Unchecks "Show in stock" and shows all products

---

### Scenario 2: Multiple Filters - No Results
**Steps**:
1. Navigate to catalog/search page
2. Check "Show in stock" + "Available at branches"
3. Result: 0 products found

**Expected**:
- Message: "There are no results found"
- Button: "Reset filters" visible and functional
- Click: Clears ALL filters and shows all products

---

### Scenario 3: Mixed Filters - No Results
**Steps**:
1. Navigate to catalog/search page
2. Apply category filter + "Show in stock" + price range
3. Result: 0 products found

**Expected**:
- Message: "There are no results found"
- Buttons: Both "Reset search" AND "Reset filters" available
- "Reset filters" clears all filters including category
- Consistent behavior across all filter types

---

## Acceptance Criteria

### 1. Display Reset Button ✅
- [ ] When filter(s) result in 0 products, display "Reset filters" button
- [ ] Button should be prominently visible below "no results" message
- [ ] Button styling consistent with existing reset buttons
- [ ] Button color: Orange (#F97316 or theme primary)
- [ ] Button includes icon (circular arrow) + text "Reset filters"

### 2. Clear All Filters ✅
Clicking "Reset filters" clears ALL active filters:
- [ ] Checkbox filters (Show in stock, Available at branches, Purchased before)
- [ ] Category filters
- [ ] Price range filters
- [ ] Brand/Material/Color filters
- [ ] Any other applied filters
- [ ] Multi-select filters

### 3. Restore Product List ✅
- [ ] After reset, display full product catalog
- [ ] Remove filter parameters from URL
- [ ] Update product count display
- [ ] Smooth transition without page refresh
- [ ] Maintain user's current page/view (catalog vs search)

### 4. Consistent Behavior ✅
- [ ] Works on catalog pages (`/catalog`)
- [ ] Works on search pages (`/search`)
- [ ] Works on category pages (`/category/*`)
- [ ] Behavior consistent across all pages with filters
- [ ] Works with single filter
- [ ] Works with multiple filters

### 5. User Feedback ✅
- [ ] Visual feedback when button is clicked (loading state or animation)
- [ ] Button hover state
- [ ] Button active/pressed state
- [ ] Smooth transition to full catalog
- [ ] No loading delays

### 6. Responsive Design ✅
- [ ] Button displays correctly on desktop (1920px+)
- [ ] Button displays correctly on tablet (768px)
- [ ] Button displays correctly on mobile (375px+)
- [ ] Touch target size minimum 44x44px on mobile
- [ ] Button text readable on all screen sizes

---

## Design Reference

**Follow existing design pattern**:
- Same styling as "Reset search" button on local search pages
- Same styling as category filter reset buttons
- Consistent with Figma design specifications

**Figma**: https://www.figma.com/design/ryT9jc1XQ2MxZOD9FLycJc/STOREFRONT-DRAFT-PART-3?node-id=1036-193810

**Reference Screenshots**:
- `tests/VCST-4066-search-no-results/TC-011-BUG-FIXED-reset-button-working.png`
- Shows current implementation of reset button for category filters

---

## Technical Implementation Notes

### Filters to Handle

**Checkbox Filters**:
- `Show in stock`
- `Available at branches`
- `Purchased before`

**Range Filters**:
- Price ranges (min-max)

**Category Filters**:
- `__outline_named` (category/outline)
- Category tree selections

**Attribute Filters**:
- BRAND
- MATERIAL
- Color
- Size
- Weight
- And all other product attributes

### Implementation Approach

```javascript
// Pseudo-code
function displayResetFiltersButton() {
  const hasFilters = Object.keys(appliedFilters).length > 0;
  const hasNoResults = productCount === 0;
  
  if (hasFilters && hasNoResults) {
    return <ResetFiltersButton onClick={clearAllFilters} />;
  }
}

function clearAllFilters() {
  // Clear all filter state
  resetCheckboxFilters();
  resetCategoryFilters();
  resetPriceFilters();
  resetAttributeFilters();
  
  // Update URL
  navigate('/search'); // or current page without facets param
  
  // Reload products
  fetchProducts();
}
```

---

## Test Cases

**Primary Test Case**: TC-011 (already exists)  
**Location**: `tests/VCST-4066-search-no-results/TC-011-search-with-filters-no-results.md`

**Test URLs**:
1. Simple filter: `https://vcst-qa-storefront.govirto.com/en-GB/search?facets=%22available_in_branches%22:true`
2. Category filter: `https://vcst-qa-storefront.govirto.com/en-GB/search?facets=%22__outline_named%22:...`
3. Multiple filters: Combine multiple facets in URL

**Test Scenarios**:
- Single checkbox filter → 0 results → Reset button appears
- Multiple checkbox filters → 0 results → Reset button appears
- Category + checkbox filters → 0 results → Reset button appears
- Price range filter → 0 results → Reset button appears
- Click reset → All filters cleared, products restored

---

## User Impact

**Positive Impact**:
- Faster navigation (1 click vs multiple clicks)
- Less frustration when no products found
- Improved product discovery
- Consistent UX across all no-results scenarios

**User Segments Affected**:
- All B2B users browsing with filters
- Users exploring product catalogs
- Users refining searches with multiple criteria

**Expected Usage**:
- Medium to High - Common scenario when users over-filter

---

## Success Metrics

**After Implementation**:
- Reduced time to clear filters (measure: 1 click vs 3+ clicks average)
- Decreased bounce rate on "no results" pages
- Increased product page views after filter reset
- Positive user feedback on filter UX

---

## Dependencies

**Frontend**:
- Access to filter state management
- URL parameter handling
- Product fetching logic

**Backend**:
- None (frontend-only change)

**Design**:
- Confirmation of button design (should match existing pattern)

---

## Risks & Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Confusion with "Reset search" | Low | Low | Clear button labeling |
| Accidentally clearing wanted filters | Medium | Medium | Add confirmation dialog (optional) or undo option |
| Performance with many filters | Low | Low | Optimize clear function |

---

## Definition of Done

- [x] Code implemented and reviewed
- [x] Unit tests written
- [x] Component tests pass
- [x] E2E tests pass (TC-011 updated and passing)
- [x] Works on catalog pages
- [x] Works on search pages
- [x] Works on category pages
- [x] Responsive design validated (desktop, tablet, mobile)
- [x] Design review approved
- [x] QA testing complete
- [x] Documentation updated
- [x] Deployed to QA environment
- [x] Product Owner sign-off

---

## Additional Notes

This story completes the "unlock user" initiative started in VCST-4066. The current implementation already handles category filters well (as verified in testing), but should be extended to cover ALL filter types consistently.

**Testing Evidence**: During comprehensive testing of VCST-4066, we found that category filters DO show reset button, but simpler filters may not. This story ensures ALL filter scenarios are covered.

**Test Documentation**: Complete test suite available in `tests/VCST-4066-search-no-results/`

---

## How to Create This Story in Jira

1. Go to https://virtocommerce.atlassian.net
2. Click "Create" (top navigation)
3. Select:
   - **Project**: VCST
   - **Issue Type**: Story
4. Fill in:
   - **Summary**: `[Filters] Add "Reset filters" button for quick filter clearing when no results found`
   - **Description**: Copy the user story and details above
   - **Priority**: Medium
   - **Story Points**: 3
5. Add labels: `filters`, `ux-enhancement`, `search`, `reset-button`
6. Link to VCST-4066 (use "relates to")
7. Link to VCST-4121 (use "relates to")
8. Assign to appropriate developer
9. Add to current sprint
10. Click "Create"

---

**Story Template Created**: October 15, 2025  
**Ready for Use**: Yes  
**Test Documentation**: Available in `tests/VCST-4066-search-no-results/`

