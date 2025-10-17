# TC-003: Orders Line-Items Target Behavior

## Test Information
- **Test Case ID**: TC-003
- **Test Area**: Orders - line-items title
- **Location**: Individual order details page
- **Expected Behavior**: Links should open based on `details_browser_target` setting (`target="_blank"`)

## Test Steps
1. Navigate to Account > Orders
2. Click on an order to open order details
3. Locate product links in the line-items section
4. Inspect the `target` attribute of product links
5. Test actual click behavior

## Expected Results
- Product links should have `target="_blank"` attribute
- Clicking on product links should open in new tab
- Links should be functional and navigate to correct product pages

## Test Data Requirements
- User must be signed in as USER2
- User must have orders with line-items for testing

## Pass/Fail Criteria
- **PASS**: All product links have `target="_blank"` and open in new tab
- **FAIL**: Any product link has incorrect target attribute or opens in same tab

## Notes
- This test verifies the `details_browser_target` setting is correctly applied to order line-item links
