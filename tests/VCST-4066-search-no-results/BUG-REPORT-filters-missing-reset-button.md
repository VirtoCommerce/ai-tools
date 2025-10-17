# Bug Report: Missing "Reset Search" Button for Filter-Based No Results

## Bug Information

| Field | Value |
|-------|-------|
| **Bug ID** | BUG-VCST-4066-001 |
| **Jira Ticket** | [VCST-4121](https://virtocommerce.atlassian.net/browse/VCST-4121) |
| **Summary** | "Reset search" button does not appear when filters result in no products |
| **Related Story** | [VCST-4066](https://virtocommerce.atlassian.net/browse/VCST-4066) |
| **Test Case** | TC-011: Search with Filters - No Products Found |
| **Severity** | Medium |
| **Priority** | High |
| **Status** | New |
| **Found By** | Test Team |
| **Found Date** | 2025-10-15 |
| **Environment** | QA - https://vcst-qa-storefront.govirto.com |
| **Browser** | Chrome (Windows) |

## Description

When a user applies filters on the catalog/search page that result in zero products, the system displays the "There are no results found" message correctly, but the "Reset search" button does NOT appear. This is inconsistent with the behavior on other pages (Back in Stock, Quotes, Orders, Company Members) where the reset button is displayed.

## Expected Behavior

When filters are applied that result in no products:
1. "There are no results found" message should be displayed ✅ (Working)
2. "Reset search" button should be displayed ✅ ❌ (MISSING)
3. Clicking reset button should clear all filters and restore products

## Actual Behavior

When filters are applied that result in no products:
1. "There are no results found" message is displayed ✅
2. "Reset search" button is **NOT displayed** ❌
3. Users must manually uncheck each filter to restore products

## Steps to Reproduce

1. Navigate to https://vcst-qa-storefront.govirto.com/en-GB/search
2. Wait for products to load (3,851 results displayed)
3. Apply a filter that results in zero products (e.g., "Available at 1 branch")
4. Observe the page content

**Actual Result**: 
- "Catalog 0 results" is shown
- "There are no results found" message is displayed
- **NO "Reset search" button appears**

**Expected Result**:
- "Catalog 0 results" is shown
- "There are no results found" message is displayed
- **"Reset search" button should be visible below the message**

## Reproducibility

**Frequency**: 100% (Always reproducible)

**Test URLs**:
- https://vcst-qa-storefront.govirto.com/en-GB/catalog?facets=%22MATERIAL%22:%22Aluminum%22
- https://vcst-qa-storefront.govirto.com/en-GB/search (apply any filter with no results)
- Any category page with filters applied resulting in no products

## Evidence

**Screenshot**: `TC-011-filters-no-reset-button-BUG.png`

**URL when bug observed**: `https://vcst-qa-storefront.govirto.com/en-GB/catalog?facets=%22MATERIAL%22:%22Aluminum%22`

**Filter Applied**: "Available at 1 branch" checkbox checked

## Impact Analysis

### User Impact
- **Moderate**: Users can still clear filters manually, but it requires extra effort
- Users must click each filter individually to restore products
- Inconsistent user experience compared to search-based no results

### Business Impact
- **Low to Medium**: Feature works but lacks consistency
- UX is degraded for users filtering products

### Technical Impact
- **Low**: Likely a missing condition in the component rendering logic

## Comparison with Working Pages

### Pages Where Reset Button WORKS ✅
1. **Back in Stock** - `/account/back-in-stock`
   - Search with no results → Reset button appears
2. **Quotes** - `/account/quotes`
   - Search with no results → Reset button appears
3. **Orders** - `/account/orders`
   - Search with no results → Reset button appears
4. **Company Members** - `/company/members`
   - Search with no results → Reset button appears
5. **Global Search** - `/search?q=nonexistent`
   - Search with no results → Reset button appears

### Pages Where Reset Button FAILS ❌
1. **Catalog/Search with Filters** - `/catalog?facets=...`
   - Filters with no results → Reset button MISSING

## Root Cause Analysis (Hypothesis)

The "Reset search" button logic may be tied to:
- Search **query** being present
- NOT tied to **filter** state

**Suggested Fix**: 
Update the component logic to display reset button when:
- Search query returns no results **OR**
- Applied filters return no results

## Workaround

Users can currently:
1. Manually uncheck each applied filter
2. Click the "X" button next to individual filter chips (if available)
3. Navigate away and return to the page

## Recommended Action

1. **Development**: Add "Reset search" button display logic for filter-based no results
2. **Testing**: Verify reset button appears when filters yield no products
3. **Testing**: Verify reset button clears all filters and restores product catalog
4. **Regression**: Ensure existing search-based reset functionality still works

## Related Issues

- **VCDZ-741**: Get more search results if filters applied (In Progress)
- May be related to filter handling logic

## Test Case Reference

See `TC-011-search-with-filters-no-results.md` for complete test case details.

## Attachments

- Screenshot: `TC-011-filters-no-reset-button-BUG.png`
- Test Case: `TC-011-search-with-filters-no-results.md`

---

**Created**: 2025-10-15  
**Last Updated**: 2025-10-15  
**Status**: Open - Awaiting Development Fix

