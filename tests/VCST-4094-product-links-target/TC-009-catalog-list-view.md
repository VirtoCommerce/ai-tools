# TC-009: Catalog List View Target Behavior

## Test Information
- **Test Case ID**: TC-009
- **Test Area**: Catalog / Category - Product title in list view
- **Location**: Category pages in list view
- **Expected Behavior**: Links should open in new tab based on `details_browser_target` setting (`target="_blank"`)

## Test Steps
1. Navigate to a category page (e.g., /catalog)
2. Switch to list view
3. Locate product title links in the list
4. Inspect the `target` attribute of product links
5. Test actual click behavior

## Expected Results
- Product links should have `target="_blank"` attribute
- Clicking on product links should open in new tab
- Links should be functional and navigate to correct product pages

## Test Data Requirements
- User must be signed in as USER2
- Category pages should have products for testing

## Pass/Fail Criteria
- **PASS**: All product links have `target="_blank"` and open in new tab
- **FAIL**: Any product link has incorrect target attribute or opens in same tab

## Notes
- This test verifies the `details_browser_target` setting is correctly applied to catalog list view product links