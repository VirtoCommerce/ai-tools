# TC-001: Quote Line-Items Target Behavior

## Test Information
- **Test Case ID**: TC-001
- **Test Area**: Quote line-items
- **Location**: Account > Quote requests
- **Expected Behavior**: Links should open based on `details_browser_target` setting (`target="_blank"`)

## Test Steps
1. Navigate to Account > Quote requests
2. Locate a quote with line-items
3. Inspect product links in the line-items section
4. Verify the `target` attribute of product links
5. Test actual click behavior

## Expected Results
- Product links should have `target="_blank"` attribute
- Clicking on product links should open in new tab
- Links should be functional and navigate to correct product pages

## Test Data Requirements
- User must be signed in as USER2
- User must have quotes with line-items for testing

## Pass/Fail Criteria
- **PASS**: All product links have `target="_blank"` and open in new tab
- **FAIL**: Any product link has incorrect target attribute or opens in same tab

## Notes
- This test verifies the `details_browser_target` setting is correctly applied to quote line-item links