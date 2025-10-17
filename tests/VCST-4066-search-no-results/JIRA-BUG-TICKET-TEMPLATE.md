# Jira Bug Ticket - Ready to Copy & Paste

## Instructions
Copy the content below and paste it into a new Jira bug ticket in the VCST project.

---

## Bug Ticket Details

**Project**: VCST  
**Issue Type**: Bug  
**Summary**: `[Search] Missing "Reset search" button when filters result in no products`

**Priority**: High  
**Assignee**: Alexander Kurilin (or appropriate developer)  
**Related to**: VCST-4066

---

## Description (Copy this into Jira Description field)

### Bug Description

When a user applies filters on the catalog/search page that result in zero products, the system displays the "There are no results found" message correctly, but the "Reset search" button does NOT appear. This is inconsistent with the behavior on other pages (Back in Stock, Quotes, Orders, Company Members, Global Search) where the reset button is displayed.

### Expected Behavior

When filters are applied that result in no products:

1. "There are no results found" message should be displayed ✅ (Working)
2. "Reset search" button should be displayed ❌ (MISSING)
3. Clicking reset button should clear all filters and restore products

### Actual Behavior

When filters are applied that result in no products:

1. "There are no results found" message is displayed ✅
2. "Reset search" button is NOT displayed ❌
3. Users must manually uncheck each filter to restore products

### Steps to Reproduce

1. Navigate to https://vcst-qa-storefront.govirto.com/en-GB/search
2. Wait for products to load (catalog displays ~3,851 products)
3. Apply a filter that results in zero products (e.g., select "Available at 1 branch" checkbox)
4. Observe the page content

**Actual Result:**
- "Catalog 0 results" is shown
- "There are no results found" message is displayed
- **NO "Reset search" button appears**

**Expected Result:**
- "Catalog 0 results" is shown
- "There are no results found" message is displayed
- **"Reset search" button should be visible below the message**

### Impact

**User Impact:** Moderate - Users can still clear filters manually, but it requires extra effort. Users must click each filter individually to restore products. This creates an inconsistent user experience.

**Business Impact:** Low to Medium - Feature works but lacks consistency. UX is degraded for users filtering products.

### Comparison with Working Pages

**Pages Where Reset Button WORKS ✅:**

- **Back in Stock** - `/account/back-in-stock` - Search with no results → Reset button appears
- **Quotes** - `/account/quotes` - Search with no results → Reset button appears
- **Orders** - `/account/orders` - Search with no results → Reset button appears
- **Company Members** - `/company/members` - Search with no results → Reset button appears
- **Global Search** - `/search?q=nonexistent` - Search with no results → Reset button appears

**Pages Where Reset Button FAILS ❌:**

- **Catalog/Search with Filters** - `/catalog?facets=...` - Filters with no results → Reset button MISSING

### Test Environment

**Environment:** QA - https://vcst-qa-storefront.govirto.com

**Test URL:** https://vcst-qa-storefront.govirto.com/en-GB/catalog?facets=%22MATERIAL%22:%22Aluminum%22

**Browser:** Chrome (Windows)

**Test Date:** October 15, 2025

**Reproducibility:** 100% (Always reproducible)

### Workaround

Users can manually uncheck each applied filter to restore products. However, this is inefficient compared to the one-click reset functionality available on other pages.

### Recommended Fix

Update the component logic to display reset button when:
- Search query returns no results **OR**
- Applied filters return no results

### Test Evidence

**Test Case:** TC-011: Search with Filters - No Products Found

**Screenshot:** TC-011-filters-no-reset-button-BUG.png (available in test documentation)

**Documentation:** tests/VCST-4066-search-no-results/BUG-REPORT-filters-missing-reset-button.md

**Test Execution Report:** tests/VCST-4066-search-no-results/TEST-EXECUTION-REPORT.md

---

## Additional Jira Fields to Set

**Labels**: 
- `search`
- `filters`
- `ux-inconsistency`
- `reset-button`

**Components**: 
- Storefront
- Search

**Affects Version/s**: Current QA build (Ver. 2.33.0-pr-1983-acf0-acf09968)

**Fix Version/s**: [To be determined by team]

**Sprint**: VCST Sprint 25-21 (or current sprint)

**Story Points**: 2-3 (estimated)

**Links**:
- **Related to**: VCST-4066
- **Related to**: VCDZ-741 (Get more search results if filters applied)

---

## Quick Copy Format (Plain Text)

```
Summary: [Search] Missing "Reset search" button when filters result in no products

Description:
When filters result in zero products on catalog/search pages, the "There are no results found" message displays but the "Reset search" button does NOT appear. This is inconsistent with search-based no results where the button works correctly.

Steps to Reproduce:
1. Go to https://vcst-qa-storefront.govirto.com/en-GB/search
2. Apply any filter that results in 0 products (e.g., "Available at 1 branch")
3. Observe: "There are no results found" appears
4. BUG: "Reset search" button does NOT appear

Expected: Reset button should be displayed for filter-based no results
Actual: Reset button is missing

Impact: Users must manually uncheck each filter instead of one-click reset

Test Evidence: TC-011, Screenshot: TC-011-filters-no-reset-button-BUG.png
Documentation: tests/VCST-4066-search-no-results/BUG-REPORT-filters-missing-reset-button.md

Environment: QA - https://vcst-qa-storefront.govirto.com
Browser: Chrome (Windows)
Reproducibility: 100%
```

---

## How to Create the Ticket in Jira

1. Go to https://virtocommerce.atlassian.net
2. Click "Create" button (top navigation)
3. Select:
   - **Project**: VCST
   - **Issue Type**: Bug
4. Fill in:
   - **Summary**: `[Search] Missing "Reset search" button when filters result in no products`
   - **Priority**: High
   - **Description**: Copy the formatted description above
   - **Assignee**: Alexander Kurilin
5. Add labels: `search`, `filters`, `ux-inconsistency`, `reset-button`
6. Link to VCST-4066 (use "relates to" link)
7. Attach screenshot: `.playwright-mcp/TC-011-filters-no-reset-button-BUG.png`
8. Click "Create"

---

**Template Created**: October 15, 2025  
**Ready for Use**: Yes  
**Screenshot Available**: `.playwright-mcp/TC-011-filters-no-reset-button-BUG.png`

