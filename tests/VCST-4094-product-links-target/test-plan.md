# VCST-4094: Product Links Target Behavior - Test Plan

## Test Information
- **JIRA Ticket**: [VCST-4094](https://virtocommerce.atlassian.net/browse/VCST-4094)
- **Test Date**: January 16, 2025
- **Tester**: AI Assistant (Claude)
- **Environment**: QA
- **Frontend Version**: 2.33.0-pr-1997-326d-326d6b0f
- **Base URL**: https://vcst-qa-storefront.govirto.com/

## Story Description
Products (including blocks like Saved for later, Recently browsed) should be opening:
- **Cart page** - defined by new setting for Cart page (as it's a special page in terms of conversion rate) by default in new tab.
- **Product Details page** - either in the same tab or in new tab (respecting `details_browser_target` setting)

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

## Expected Behavior
- **Cart page links**: Open in new tab (`target="_blank"`) - controlled by `cart_page_browser_target`
- **Product page links**: Open in same tab (`target="_self"`) - controlled by `product_page_browser_target`
- **Product details links**: Open in new tab (`target="_blank"`) - controlled by `details_browser_target`

## Test User Credentials
- **User**: USER2 (Cypress-Corporate Kft. / John Updated Smith)
- **Email**: ricreyacrouyi-3425@yopmail.com
- **Password**: Password1

## Testing Scope (12 Areas)

### 1. Quote line-items
- **Location**: Account > Quote requests
- **Expected**: Links should open based on `details_browser_target` setting (`target="_blank"`)

### 2. Orders
- **Location**: Account > Orders
- **Expected**: Order details should open in separate tab based on `details_browser_target` setting (`target="_blank"`)

### 3. Orders - line-items title
- **Location**: Individual order details page
- **Expected**: Links should open based on `details_browser_target` setting (`target="_blank"`)

### 4. Cart - line-items title
- **Location**: Cart page
- **Expected**: Links should open in new tab based on `cart_page_browser_target` setting (`target="_blank"`)

### 5. Cart - gift section
- **Location**: Cart page gift section
- **Expected**: Links should open in new tab based on `cart_page_browser_target` setting (`target="_blank"`)

### 6. Cart - Saved for later line-items
- **Location**: Cart page "Saved for later" section
- **Expected**: Links should open in new tab based on `cart_page_browser_target` setting (`target="_blank"`)

### 7. Cart - Recently browsed section
- **Location**: Cart page "Recently browsed" section
- **Expected**: Links should open in new tab based on `cart_page_browser_target` setting (`target="_blank"`)

### 8. Catalog / Category - Product title in grid view
- **Location**: Category pages in grid view
- **Expected**: Links should open in new tab based on `details_browser_target` setting (`target="_blank"`)

### 9. Catalog / Category - Product title in list view
- **Location**: Category pages in list view
- **Expected**: Links should open in new tab based on `details_browser_target` setting (`target="_blank"`)

### 10. Product page - Related section
- **Location**: Product detail page "Related" section
- **Expected**: Links should open in same tab based on `product_page_browser_target` setting (`target="_self"`)

### 11. Product page - Recommendations
- **Location**: Product detail page "Recommendations" section
- **Expected**: Links should open in same tab based on `product_page_browser_target` setting (`target="_self"`)

### 12. Lists - line-item title
- **Location**: Account > Lists
- **Expected**: Links should open based on `details_browser_target` setting (`target="_blank"`)

## Test Execution Strategy

### Phase 1: Documentation Setup
1. Create individual test case files for each area
2. Document expected behavior and test steps
3. Prepare test data and navigation paths

### Phase 2: Automated Testing
1. Use Playwright MCP with Edge browser
2. Navigate to each test area systematically
3. Inspect product link elements for `target` attribute
4. Verify actual click behavior (new tab vs same tab)
5. Capture screenshots for evidence

### Phase 3: Results Documentation
1. Create comprehensive test execution report
2. Document any discrepancies found
3. Create CSV summary of results
4. Update JIRA ticket with findings

## Test Data Requirements
- User must be signed in as USER2
- Cart should contain items for testing
- User should have orders and quotes for testing
- User should have lists for testing

## Success Criteria
- All product links open with correct `target` attribute based on their respective settings
- Cart page links open in new tab (`cart_page_browser_target: "_blank"`)
- Product page links open in same tab (`product_page_browser_target: "_self"`)
- details links open in new tab (`details_browser_target: "_blank"`)
- No broken links or unexpected behavior

## Risk Assessment
- **Low Risk**: Standard link target testing
- **Dependencies**: Requires authenticated user session
- **Browser Compatibility**: Testing on Edge browser only

## Test Environment
- **Browser**: Microsoft Edge (via Playwright MCP)
- **Resolution**: Default browser resolution
- **Network**: Standard internet connection
- **User Agent**: Playwright default

## Notes
- All tests will be performed on the QA environment
- Screenshots will be captured for each test area
- Results will be documented in individual test case files
- Final summary will be provided in CSV format
