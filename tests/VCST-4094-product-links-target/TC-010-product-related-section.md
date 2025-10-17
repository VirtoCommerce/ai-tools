# TC-010: Product Related Section Target Behavior

## Test Information
- **Test Case ID**: TC-010
- **Test Area**: Product page - Related section
- **Location**: Product detail page "Related" section
- **Expected Behavior**: Links should open in same tab based on `product_page_browser_target` setting (`target="_self"`)

## Test Steps
1. Navigate to a product detail page
2. Locate the "Related" section (e.g., "Customers bought together", "You might also like")
3. Find product links in the related section
4. Inspect the `target` attribute of product links
5. Test actual click behavior

## Expected Results
- Product links should have `target="_self"` attribute (or no target attribute)
- Clicking on product links should open in same tab
- Links should be functional and navigate to correct product pages

## Test Data Requirements
- User must be signed in as USER2
- Product pages should have related products for testing

## Pass/Fail Criteria
- **PASS**: All product links have `target="_self"` and open in same tab
- **FAIL**: Any product link has incorrect target attribute or opens in new tab

## Notes
- This test verifies the `product_page_browser_target` setting is correctly applied to product related section links
