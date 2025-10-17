# TC-005: Cart Gift Section Target Behavior

## Test Information
- **Test Case ID**: TC-005
- **Test Area**: Cart - gift section
- **Location**: Cart page gift section
- **Expected Behavior**: Links should open in new tab based on `cart_page_browser_target` setting (`target="_blank"`)

## Test Steps
1. Navigate to Cart page
2. Locate the gift section (if present)
3. Find product links in the gift section
4. Inspect the `target` attribute of product links
5. Test actual click behavior

## Expected Results
- Product links should have `target="_blank"` attribute
- Clicking on product links should open in new tab
- Links should be functional and navigate to correct product pages

## Test Data Requirements
- User must be signed in as USER2
- Cart should have gift section with products for testing

## Pass/Fail Criteria
- **PASS**: All product links have `target="_blank"` and open in new tab
- **FAIL**: Any product link has incorrect target attribute or opens in same tab

## Notes
- This test verifies the `cart_page_browser_target` setting is correctly applied to cart gift section links