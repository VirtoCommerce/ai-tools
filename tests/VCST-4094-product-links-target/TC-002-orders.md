# TC-002: Orders Target Behavior

## Test Information
- **Test Case ID**: TC-002
- **Test Area**: Orders
- **Location**: Account > Orders
- **Expected Behavior**: Order details should open in separate tab based on `details_browser_target` setting (`target="_blank"`)

## Test Steps
1. Navigate to Account > Orders
2. Locate an order in the orders list
3. Click on the order to view details
4. Verify that order details open in a new tab
5. Check the `target` attribute of the order link

## Expected Results
- Order details should open in new tab (`target="_blank"`)
- New tab should display the order details page
- Original orders list should remain in the original tab

## Test Data Requirements
- User must be signed in as USER2
- User must have orders for testing

## Pass/Fail Criteria
- **PASS**: Order details open in new tab with `target="_blank"`
- **FAIL**: Order details open in same tab or have incorrect target attribute

## Notes
- This test verifies the `details_browser_target` setting is correctly applied to order links