# TC-012: Lists Line-Items Target Behavior

## Test Information
- **Test Case ID**: TC-012
- **Test Area**: Lists - line-item title
- **Location**: Account > Lists
- **Expected Behavior**: Links should open based on `details_browser_target` setting (`target="_blank"`)

## Test Steps
1. Navigate to Account > Lists
2. Click on a list to view list items
3. Locate product links in the list items
4. Inspect the `target` attribute of product links
5. Test actual click behavior

## Expected Results
- Product links should have `target="_blank"` attribute
- Clicking on product links should open in new tab
- Links should be functional and navigate to correct product pages

## Test Data Requirements
- User must be signed in as USER2
- User should have lists with items for testing

## Pass/Fail Criteria
- **PASS**: All product links have `target="_blank"` and open in new tab
- **FAIL**: Any product link has incorrect target attribute or opens in same tab

## Notes
- This test verifies the `details_browser_target` setting is correctly applied to lists line-item links