# VCST-4094: Product Links Target Behavior Testing

## Overview
This test suite validates the product link target behavior across different areas of the Virto Commerce B2B storefront, ensuring that links open with the correct `target` attribute based on frontend settings.

## JIRA Ticket
[VCST-4094](https://virtocommerce.atlassian.net/browse/VCST-4094) - Product links "target" behavior on Cart and Product details pages

## Test Environment
- **Environment**: QA
- **Frontend Version**: 2.33.0-pr-1997-326d-326d6b0f
- **Base URL**: https://vcst-qa-storefront.govirto.com/
- **Browser**: Microsoft Edge (via Playwright MCP)
- **Test User**: USER2 (Cypress-Corporate Kft. / John Updated Smith)

## Frontend Settings
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

## Expected Behavior
- **Cart page links**: Open in new tab (`target="_blank"`)
- **Product page links**: Open in same tab (`target="_self"`)
- **Product details links**: Open in new tab (`target="_blank"`)

## Test Results Summary

| Status | Count | Percentage |
|--------|-------|------------|
| ✅ PASS | 4 | 33.3% |
| ❌ FAIL | 3 | 25.0% |
| ⏸️ NOT_TESTED | 5 | 41.7% |

## Issues Found
1. **Daily Deals Product Links**: Product links in Daily Deals section have no target attribute (should be `target="_blank"`)
2. **Product Related Section Links**: Product links in Related section have `target="_blank"` (should be `target="_self"`)
3. **Product Recommendations Links**: Product links in Recommendations section have `target="_blank"` (should be `target="_self"`)

## Files Structure
```
tests/VCST-4094-product-links-target/
├── README.md                           # This file
├── test-plan.md                        # Comprehensive test plan
├── TEST-EXECUTION-REPORT.md            # Detailed test execution report
├── test-results-summary.csv            # CSV summary of all test results
├── TC-001-quote-line-items.md          # Test case 1
├── TC-002-orders.md                    # Test case 2
├── TC-003-order-line-items.md          # Test case 3
├── TC-004-cart-line-items.md           # Test case 4
├── TC-005-cart-gift-section.md         # Test case 5
├── TC-006-cart-saved-for-later.md      # Test case 6
├── TC-007-cart-recently-browsed.md     # Test case 7
├── TC-008-catalog-grid-view.md         # Test case 8
├── TC-009-catalog-list-view.md         # Test case 9
├── TC-010-product-related.md           # Test case 10
├── TC-011-product-recommendations.md   # Test case 11
├── TC-012-lists-line-items.md          # Test case 12
└── screenshots/                        # Test execution screenshots
    ├── TC-003-order-line-items-results.png
    ├── TC-004-cart-line-items-results.png
    ├── TC-008-catalog-grid-view-results.png
    └── TC-010-product-related-results.png
```

## Test Execution Details
- **Test Date**: January 16, 2025
- **Tester**: AI Assistant (Claude)
- **Execution Method**: Automated browser testing using Playwright MCP
- **Test Coverage**: 7 out of 12 test areas (58.3%)
- **Product Tested**: SKU: ZMG-75846972 (Custom Form-Fit Car Cover)

## Recommendations
1. **Fix Daily Deals Links**: Update the Daily Deals section to use `target="_blank"` for product links
2. **Fix Product Page Links**: Update Related and Recommendations sections to use `target="_self"` for product links
3. **Verify Frontend Settings**: Ensure the frontend settings are properly applied to all product link components
4. **Test with Data**: Re-run tests when cart has items and quotes are available

## Conclusion
The testing revealed that while some areas are working correctly (Orders, Cart Recently browsed, Lists), there are significant issues with the Daily Deals section and Product page related sections. The frontend settings are not being consistently applied across all product link components, which affects the user experience and navigation behavior.

**Overall Status**: **PARTIAL PASS** - 4 out of 7 testable areas passed, with 3 critical failures that need to be addressed.
