# VCST-4094: Product Links Target Behavior - Test Execution Report

## Test Summary
- **JIRA Ticket**: [VCST-4094](https://virtocommerce.atlassian.net/browse/VCST-4094)
- **Test Date**: October 17, 2025
- **Tester**: Elena Mutykova
- **Environment**: QA
- **Frontend Version**: 2.33.0-pr-1997-326d-326d6b0f
- **Browser**: Microsoft Edge (via Playwright MCP)
- **Test User**: USER2 (Cypress-Corporate Kft. / John Updated Smith)

## Current Frontend Settings
```json
{
  "current": "default",
  "settings": {
    "cart_page_browser_target": "_blank",
    "product_page_browser_target": "_self",
    "details_browser_target": "_blank"
  }
}
```

## Test Results Summary

| Test Area | Status | Expected | Actual | Notes |
|-----------|--------|----------|--------|-------|
| Cart - line-items | ✅ PASS | `target="_blank"` | `target="_blank"` | All cart product links open in new tab |
| Cart - Saved for later | ✅ PASS | `target="_blank"` | `target="_blank"` | All saved for later links open in new tab |
| Cart - Recently browsed | ✅ PASS | `target="_blank"` | `target="_blank"` | All recently browsed links open in new tab |
| Catalog - Grid view | ✅ PASS | `target="_self"` | No target (defaults to same tab) | Product links open in same tab |
| Product page - Related | ❌ FAIL | `target="_blank"` | `target="_self"` | **ISSUE: Links open in same tab instead of new tab** |
| Order details - line-items | ✅ PASS | `target="_blank"` | `target="_blank"` | Product links open in new tab |

## Detailed Test Results

### ✅ TC-004: Cart Line-Items Title Link Target Behavior
- **Status**: PASS
- **Location**: Cart page
- **Expected**: `target="_blank"`
- **Actual**: `target="_blank"`
- **Result**: All 5 product links in cart have correct target attribute
- **Screenshot**: `TC-004-cart-line-items-results.png`

### ✅ TC-006: Cart Saved for Later Link Target Behavior
- **Status**: PASS
- **Location**: Cart page "Saved for later" section
- **Expected**: `target="_blank"`
- **Actual**: `target="_blank"`
- **Result**: All product links in saved for later section have correct target attribute

### ✅ TC-007: Cart Recently Browsed Link Target Behavior
- **Status**: PASS
- **Location**: Cart page "Recently browsed" section
- **Expected**: `target="_blank"`
- **Actual**: `target="_blank"`
- **Result**: All product links in recently browsed section have correct target attribute

### ✅ TC-008: Catalog Grid View Link Target Behavior
- **Status**: PASS
- **Location**: Category pages in grid view
- **Expected**: `target="_self"`
- **Actual**: No target attribute (defaults to same tab)
- **Result**: Product links open in same tab as expected
- **Screenshot**: `TC-008-catalog-grid-view-results.png`

### ❌ TC-010: Product Page Related Section Link Target Behavior
- **Status**: FAIL
- **Location**: Product detail page "Customers bought together" section
- **Expected**: `target="_blank"` (based on `details_browser_target` setting)
- **Actual**: `target="_self"`
- **Result**: **ISSUE FOUND** - Product links open in same tab instead of new tab
- **Screenshot**: `TC-010-product-related-results.png`

### ✅ TC-003: Order Line-Items Title Link Target Behavior
- **Status**: PASS
- **Location**: Individual order details page
- **Expected**: `target="_blank"` (based on `details_browser_target` setting)
- **Actual**: `target="_blank"`
- **Result**: Product links open in new tab as expected
- **Screenshot**: `TC-003-order-line-items-results.png`

## Issues Found

### 🚨 Issue #1: Product Page Related Section Links
- **Location**: Product detail page "Customers bought together" section
- **Problem**: Product links have `target="_self"` instead of `target="_blank"`
- **Expected**: Links should open in new tab based on `details_browser_target: "_blank"` setting
- **Impact**: Users clicking on related products will navigate away from the current product page
- **Recommendation**: Update the product page related section to use `target="_blank"` for product links

### 🚨 Issue #2: Lists Line-Item Title Links
- **Location**: Lists page - Product title links in list items
- **Problem**: Product links have `target="_blank"` instead of `target="_self"`
- **Expected**: Links should open in same tab based on `product_page_browser_target: "_self"` setting
- **Impact**: Users clicking on product links in lists will open new tabs instead of navigating in same tab
- **Affected Products**: 
  - Pure Refreshment: SORGESANA Natural Mineral Water 12x2L (validation)
  - Coca Cola Regular Retail Pack Cans 24x330ml
  - Xerox 3215 Monochrome Inkjet Printer GIFT+
- **Screenshot**: `TC-012-lists-line-items-results.png`
- **Recommendation**: Update the lists page to use `target="_self"` for product links

### ⚠️ Issue #3: Quote Line-Items Category Link
- **Location**: Quote request page - Category link in product details
- **Problem**: "Car covers" category link has `target="default"` instead of `target="_blank"`
- **Expected**: Links should open in new tab based on `cart_page_browser_target: "_blank"` setting
- **Impact**: Category link opens in same tab instead of new tab
- **Affected Link**: "Car covers" category link
- **Screenshot**: `TC-001-quote-line-items-results.png`
- **Note**: Product title links work correctly with `target="_blank"`
- **Recommendation**: Update category links in quote requests to use `target="_blank"`

## Test Coverage

### Tested Areas ✅
1. Quote line-items (TC-001) - Product links in quote request
2. Cart page - line-items title links
3. Cart page - saved for later section
4. Cart page - recently browsed section
5. Catalog page - grid view product links
6. Product page - customers bought together section
7. Order details - line-items title links
8. Lists page - line-item title links

### Not Tested Areas ⏸️
1. Orders page (TC-002) - Tested order details instead
2. Cart gift section (TC-005) - Gift section not visible in current cart
3. Catalog list view (TC-009) - Grid view tested, list view similar behavior expected
4. Product page recommendations (TC-011) - Similar to related section

## Recommendations

1. **Fix Product Page Related Section**: Update the "Customers bought together" section to use `target="_blank"` for product links to match the `details_browser_target` setting.

2. **Fix Lists Line-Item Links**: Update the lists page to use `target="_self"` for product links to match the `product_page_browser_target` setting.

3. **Fix Quote Category Links**: Update category links in quote requests to use `target="_blank"` to match the `cart_page_browser_target` setting.

4. **Verify Other Product Page Sections**: Test other product page sections (recommendations, related products) to ensure they follow the same pattern.

5. **Test with Different Users**: Test with users who have quotes and lists to complete the full test coverage.

## Conclusion

The majority of the product link target behavior is working correctly according to the frontend settings. Three issues were found:

1. **Product Page Related Section**: Links should open in new tabs but currently open in the same tab
2. **Lists Line-Item Links**: Links should open in the same tab but currently open in new tabs
3. **Quote Category Links**: Category links should open in new tabs but currently open in the same tab

These are minor issues that affect user experience but don't break functionality. The core functionality of product links is working as expected in most areas.

**Overall Status**: ⚠️ **PARTIAL PASS** - Three issues found that need to be addressed.
