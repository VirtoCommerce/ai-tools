# Test Case: TC-011 - Search with Filters - No Products Found

## Test Case Information

| Field | Value |
|-------|-------|
| **Test Case ID** | TC-011 |
| **Test Case Name** | Search with Filters - No Products Found |
| **Related Story** | [VCST-4066](https://virtocommerce.atlassian.net/browse/VCST-4066) |
| **Priority** | P2 - High |
| **Test Type** | Functional |
| **Automation Status** | Manual |
| **Created By** | Test Team |
| **Created Date** | 2025-10-15 |

## Objective
Verify that when a user applies filters that result in no matching products, the system displays a clear "no results" message with a "Reset search" button that clears all filters and restores the product catalog.

## Preconditions
1. User is on VirtoStart Demo Store
2. User has navigated to a catalog/search page with products
3. Multiple filters are available (price, category, brand, etc.)
4. Test environment: https://vcst-qa-storefront.govirto.com

## Test Data
- **Valid filter combination**: [Filters that return products]
- **Invalid filter combination**: [Filters that return no products - e.g., Price: $0-$1 + Brand: NonExistentBrand]
- **Test pages**: Search results page, Category pages

## Test Steps - Global Search with Filters

| Step # | Action | Expected Result |
|--------|--------|-----------------|
| 1 | Navigate to https://vcst-qa-storefront.govirto.com/en-GB/search | Search page loads successfully |
| 2 | Verify products are displayed | Product grid shows available items |
| 3 | Note the number of products displayed | Product count is visible (e.g., "3,851 results") |
| 4 | Apply a valid filter (e.g., select a brand) | Products are filtered successfully |
| 5 | Verify filtered results are displayed | Only products matching filter are shown |
| 6 | Apply additional filters that result in no matches | Filters are applied successfully |
| 7 | Observe the page content | "No results found" message is displayed |
| 8 | Verify the "Reset search" button is visible | "Reset search" button is prominently displayed |
| 9 | Verify filter selections are still visible | Applied filters are shown in sidebar/filter area |
| 10 | Verify the message text matches design specs | Message text is clear and user-friendly |
| 11 | Click the "Reset search" button | Button responds to click action |
| 12 | Observe the page after reset | All filters are cleared |
| 13 | Verify full product catalog is restored | All products are displayed again |
| 14 | Verify filter selections are cleared | No filters remain selected |

## Test Steps - Category Page with Filters

| Step # | Action | Expected Result |
|--------|--------|-----------------|
| 15 | Navigate to a category page with products | Category page loads with products |
| 16 | Note available filters (price, brand, color, etc.) | Filters are visible in sidebar |
| 17 | Apply a combination of filters that yields no results | Filters are applied |
| 18 | Observe the page content | "No results found" message is displayed |
| 19 | Verify the "Reset search" button is visible | "Reset search" button is prominently displayed |
| 20 | Click the "Reset search" button | Button responds to click action |
| 21 | Verify all filters are cleared | Filter selections are reset |
| 22 | Verify category products are restored | Category products are displayed |

## Test Steps - Multiple Filter Scenarios

### Scenario A: Price Filter - No Results
| Step # | Action | Expected Result |
|--------|--------|-----------------|
| A1 | Navigate to search or category page | Page loads with products |
| A2 | Apply price filter: $0.01 - $0.10 (unrealistic range) | Filter is applied |
| A3 | Verify no results message appears | "No results found" message is displayed |
| A4 | Verify reset button is available | "Reset search" button is visible |
| A5 | Click reset button | All filters cleared, products restored |

### Scenario B: Multiple Filters - No Results
| Step # | Action | Expected Result |
|--------|--------|-----------------|
| B1 | Navigate to search or category page | Page loads with products |
| B2 | Apply multiple filters: Brand + Color + Price | Filters are applied |
| B3 | Combine filters that yield no matches | No products match the criteria |
| B4 | Verify no results message appears | "No results found" message is displayed |
| B5 | Verify reset button is available | "Reset search" button is visible |
| B6 | Click reset button | All filters cleared, products restored |

### Scenario C: Search Query + Filters - No Results
| Step # | Action | Expected Result |
|--------|--------|-----------------|
| C1 | Navigate to search page | Search page loads |
| C2 | Enter a search term (e.g., "laptop") | Search executes, results displayed |
| C3 | Apply filters that eliminate all results | Filters are applied |
| C4 | Verify no results message appears | "No results found" message is displayed |
| C5 | Verify reset button is available | "Reset search" button is visible |
| C6 | Verify search term remains visible | Search query is still in the search field |
| C7 | Click reset button | Filters cleared, search results for "laptop" restored |

## Expected Results

### Visual Elements
- **No Results Message**: Clear, user-friendly message indicating no results were found
- **Reset Button**: Prominent "Reset search" button is displayed
- **Filter Display**: Applied filters remain visible (but can be cleared)
- **Layout**: Page maintains proper layout and styling
- **Design Consistency**: Matches Figma design specifications

### Functional Behavior
- Filters can be applied successfully without errors
- No results page displays when filter combination yields no matches
- Reset button clears all applied filters
- Product catalog is restored after reset
- Search query (if present) is preserved or cleared based on design
- Filter state is reset to default
- No page refresh is required (smooth transition)
- Filter counts update correctly after reset

### Filter-Specific Behavior
- **Price filters**: Can be set to ranges with no products
- **Category filters**: Can be combined to eliminate results
- **Brand filters**: Can be selected with incompatible criteria
- **Multi-select filters**: All selections are cleared on reset
- **Range filters**: Reset to default ranges

## Actual Results

**Test Executed**: October 15, 2025  
**Environment**: https://vcst-qa-storefront.govirto.com  
**User**: USER2 (John Updated Smith / Cypress-Corporate Kft.)  
**Browser**: Chrome (Windows)

### Test Results Summary

**Steps 1-6**: ✅ PASSED
- Navigated to catalog page successfully
- Products displayed correctly
- Applied filter: "Available at 1 branch" 
- Filter successfully resulted in 0 products

**Steps 7-10**: ⚠️ PARTIAL PASS
- ✅ "There are no results found" message is displayed
- ❌ **"Reset search" button is NOT VISIBLE** - Expected to be displayed
- ✅ Filter selection remains visible in sidebar
- ✅ Message text matches design specs

**Steps 11-14**: ❌ CANNOT BE TESTED
- Cannot click reset button because it's not present
- Had to manually uncheck filter to restore products

### Defect Found
**BUG-VCST-4066-001**: "Reset search" button does not appear when filters result in no products

**Evidence**: Screenshot saved as `TC-011-filters-no-reset-button-BUG.png`

**URL**: https://vcst-qa-storefront.govirto.com/en-GB/catalog?facets=%22MATERIAL%22:%22Aluminum%22

## Status
- [ ] Pass
- [x] Fail
- [ ] Blocked
- [ ] Not Executed

**Failure Reason**: Reset search button does not appear when filtering results in no products. Feature is incomplete for filter-based no results scenarios.

## Test Evidence
- Screenshot: `TC-011-filters-no-reset-button-BUG.png` (Full page screenshot showing missing reset button)
- URL: https://vcst-qa-storefront.govirto.com/en-GB/catalog?facets=%22MATERIAL%22:%22Aluminum%22

## Notes/Comments

### Test Execution Notes
- Test executed on October 15, 2025
- User successfully logged in as USER2 (ricreyacrouyi-3425@yopmail.com)
- Filter "Available at 1 branch" applied successfully
- No products matched the filter criteria (0 results)
- "There are no results found" message displayed correctly
- **Critical Issue**: Reset button missing for filter-based no results

### Inconsistency Found
The "Reset search" button appears correctly on:
- Back in Stock page (search-based no results) ✅
- Quotes page (search-based no results) ✅
- Orders page (search-based no results) ✅
- Company Members page (search-based no results) ✅
- Global Search page (search query-based no results) ✅

But does NOT appear on:
- Catalog/Search pages (filter-based no results) ❌

This creates an inconsistent user experience.

### Filter Combinations to Test
Document specific filter combinations that should be tested:

| Filter Type | Combination | Expected Outcome |
|-------------|-------------|------------------|
| Price | $0.01 - $0.10 | No products |
| Brand + Color | NonExistent Brand + Specific Color | No products |
| Price + Brand + Category | Unrealistic combination | No products |
| Multiple attributes | 5+ filters simultaneously | No products |

## Defects Found

**BUG-VCST-4066-001**: Missing "Reset search" button when filters result in no products

**Jira Ticket**: [VCST-4121](https://virtocommerce.atlassian.net/browse/VCST-4121)

**Details**: See `BUG-REPORT-filters-missing-reset-button.md`

**Severity**: Medium  
**Priority**: High  
**Impact**: Users cannot quickly reset filters; must manually uncheck each filter

## Browser/Device Tested
- [x] Chrome (Windows) - FAILED (Reset button missing)
- [ ] Firefox (Windows)
- [ ] Edge (Windows)
- [ ] Safari (macOS)
- [ ] Mobile Chrome (Android)
- [ ] Mobile Safari (iOS)

## Related Test Cases
- TC-001: Back in Stock - No Results
- TC-002: Quotes - No Results
- TC-003: Orders - No Results
- TC-004: Company Members - No Results
- TC-005: Global Search - No Results
- TC-006: UI/UX Consistency Validation
- TC-010: Edge Cases - Special Characters in Search

## Additional Validation Points

### Filter State Management
- [ ] Filter selections persist during no results state
- [ ] Filter counts are accurate after reset
- [ ] Filter panel remains accessible and functional
- [ ] Filter clear buttons (individual) work alongside reset button

### Performance
- [ ] Filter application is smooth and responsive
- [ ] Reset action completes quickly (< 1 second)
- [ ] No lag when clearing multiple filters
- [ ] Product grid reloads efficiently after reset

### Accessibility
- [ ] Reset button is keyboard accessible
- [ ] Screen readers announce filter changes
- [ ] Focus management is correct after reset
- [ ] Filter state changes are clearly communicated

## Dependencies
- **Related to**: [VCDZ-741](https://virtocommerce.atlassian.net/browse/VCDZ-741) - Get more search results if filters applied (In Progress)
- **Blocks**: None
- **Blocked by**: None

