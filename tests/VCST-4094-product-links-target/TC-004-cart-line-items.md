# TC-004: Cart Line-Items Target Behavior

## Test Information
- **Test Case ID**: TC-004
- **Test Area**: Cart - line-items title
- **Location**: Cart page
- **Expected Behavior**: Links should open in new tab based on `cart_page_browser_target` setting (`target="_blank"`)

## Test Steps
1. Navigate to Cart page
2. Locate product links in the cart line-items section
3. Inspect the `target` attribute of product links
4. Test actual click behavior
5. Verify links open in new tab

## Expected Results
- Product links should have `target="_blank"` attribute
- Clicking on product links should open in new tab
- Links should be functional and navigate to correct product pages

## Test Data Requirements
- User must be signed in as USER2
- Cart should contain items for testing

## Pass/Fail Criteria
- **PASS**: All product links have `target="_blank"` and open in new tab
- **FAIL**: Any product link has incorrect target attribute or opens in same tab

## Notes
- This test verifies the `cart_page_browser_target` setting is correctly applied to cart line-item links