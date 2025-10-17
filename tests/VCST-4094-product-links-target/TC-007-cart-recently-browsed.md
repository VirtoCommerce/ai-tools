# TC-007: Cart Recently Browsed Target Behavior

## Test Information
- **Test Case ID**: TC-007
- **Test Area**: Cart - Recently browsed section
- **Location**: Cart page "Recently browsed" section
- **Expected Behavior**: Links should open in new tab based on `cart_page_browser_target` setting (`target="_blank"`)

## Test Steps
1. Navigate to Cart page
2. Locate the "Recently browsed" section
3. Find product links in the recently browsed section
4. Inspect the `target` attribute of product links
5. Test actual click behavior

## Expected Results
- Product links should have `target="_blank"` attribute
- Clicking on product links should open in new tab
- Links should be functional and navigate to correct product pages

## Test Data Requirements
- User must be signed in as USER2
- Cart should have items in "Recently browsed" section for testing

## Pass/Fail Criteria
- **PASS**: All product links have `target="_blank"` and open in new tab
- **FAIL**: Any product link has incorrect target attribute or opens in same tab

## Notes
- This test verifies the `cart_page_browser_target` setting is correctly applied to recently browsed links