# Test Cases for VCST-3955: Upgrade of Datatrans payment module to latest VC

## User Story Details
- **Jira Key**: VCST-3955
- **Summary**: Upgrade of Datatrans payment module to latest VC
- **Priority**: Medium
- **Status**: Testing
- **Created**: 9/17/2025

## Description
VirtoCommerce/vc-module-datatrans: Datatrans Checkout payment gateway module upgrade to ensure compatibility with the latest version of VirtoCommerce platform.

---

## Test Cases

### Test Case 1: Verify Datatrans Module Installation and Compatibility
**Objective**: Validate that the upgraded Datatrans payment module installs successfully on the latest VC platform and is recognized by the system.

**Preconditions**:
- Latest version of VirtoCommerce Platform is installed (https://docs.virtocommerce.org/platform/developer-guide/deploy-from-precompiled-binaries/)
- Admin access to VirtoCommerce platform
- Datatrans payment module package is available
- Module dependencies are met (https://docs.virtocommerce.org/platform/developer-guide/module-development/)

**Test Steps**:
1. Navigate to Platform → Modules section in the VirtoCommerce admin panel
2. Install the upgraded Datatrans payment module using "Install from file" or module marketplace
3. Verify module appears in the installed modules list
4. Check module version number matches the upgraded version
5. Restart the platform if required
6. Navigate to Stores → [Store Name] → Payment Methods
7. Verify "Datatrans" appears as an available payment gateway option

**Expected Results**:
- Module installs without errors
- Module status shows as "Installed" and "Active"
- Module version is displayed correctly
- Datatrans payment gateway is available in payment methods list
- No compatibility warnings or errors in system logs
- Module dependencies are satisfied

**Test Data**: 
- Datatrans module package (latest version)
- Valid VirtoCommerce admin credentials

**Priority**: High

---

### Test Case 2: Datatrans Payment Gateway Configuration
**Objective**: Verify that all Datatrans payment gateway configuration settings can be properly configured and saved in the upgraded module.

**Preconditions**:
- Datatrans module is successfully installed (https://docs.virtocommerce.org/platform/developer-guide/module-development/)
- Admin access to store settings
- Valid Datatrans merchant credentials (Merchant ID, API credentials)
- Store is created and configured (https://docs.virtocommerce.org/user-guide/store-settings/)

**Test Steps**:
1. Navigate to Stores → [Store Name] → Payment Methods
2. Click "Add" to create a new payment method
3. Select "Datatrans" from the payment gateway dropdown
4. Configure the following settings:
   - Merchant ID
   - API Key/Secret
   - Security settings (HMAC key)
   - Payment mode (Test/Production)
   - Supported currencies
   - Transaction types (Authorization, Capture, etc.)
5. Enable "Is Active" toggle
6. Click "Save" button
7. Navigate away and return to verify settings persistence
8. Edit the payment method and modify settings
9. Save and verify changes are retained

**Expected Results**:
- All configuration fields are visible and editable
- Required fields validation works correctly
- Settings save successfully without errors
- Saved settings persist after page reload
- Modified settings update correctly
- No console errors or warnings
- Configuration matches Datatrans API requirements

**Test Data**:
- Test Merchant ID: (use Datatrans test credentials)
- Test API credentials
- Supported currencies: USD, EUR, CHF

**Priority**: High

---

### Test Case 3: End-to-End Payment Processing with Datatrans
**Objective**: Validate complete payment flow from cart checkout through payment completion using the upgraded Datatrans module.

**Preconditions**:
- Datatrans payment method is configured and active (https://docs.virtocommerce.org/user-guide/payment-configuration/)
- Test store is set up with products (https://docs.virtocommerce.org/user-guide/catalog-management/)
- Customer account exists or guest checkout is enabled
- Datatrans test environment is accessible
- Valid test credit card details are available

**Test Steps**:
1. Navigate to the storefront and add products to cart
2. Proceed to checkout
3. Fill in shipping address and select shipping method
4. Select "Datatrans" as payment method
5. Click "Place Order" or "Continue to Payment"
6. Verify redirection to Datatrans payment page/lightbox
7. Enter test credit card details on Datatrans interface:
   - Card number
   - Expiry date
   - CVV
   - Cardholder name
8. Submit payment on Datatrans page
9. Verify redirection back to store's success page
10. Check order status in admin panel (Orders section)
11. Verify payment transaction details are recorded

**Expected Results**:
- Customer is successfully redirected to Datatrans payment interface
- Datatrans payment page displays correct order amount and currency
- Payment processes successfully with test credentials
- Customer is redirected back to store confirmation page
- Order is created with status "Processing" or "Paid"
- Payment transaction is recorded with correct amount
- Order details show Datatrans as payment method
- Transaction ID from Datatrans is stored in order
- Customer receives order confirmation email

**Test Data**:
- Test Credit Card: 4242 4242 4242 4242 (or Datatrans-specific test card)
- Expiry: 12/25
- CVV: 123
- Order Amount: $50.00

**Priority**: High

---

### Test Case 4: Payment Failure and Error Handling
**Objective**: Verify that the system handles payment failures, declined transactions, and error scenarios gracefully.

**Preconditions**:
- Datatrans payment method is configured in test mode
- Test store is operational
- Access to Datatrans test cards that simulate failures (https://docs.virtocommerce.org/user-guide/orders/)

**Test Steps**:
1. Add products to cart and proceed to checkout
2. Select Datatrans as payment method
3. **Scenario A - Declined Card:**
   - Enter a test card number that simulates decline
   - Submit payment
   - Verify error message display
4. **Scenario B - Insufficient Funds:**
   - Use test card that simulates insufficient funds
   - Submit payment
   - Verify appropriate error message
5. **Scenario C - Payment Timeout:**
   - Initiate payment but do not complete within timeout period
   - Verify system behavior
6. **Scenario D - User Cancels Payment:**
   - Proceed to Datatrans page
   - Click cancel/back button
   - Verify return to checkout page
7. Check order status in admin panel for each scenario
8. Verify no duplicate orders are created
9. Verify customer can retry payment

**Expected Results**:
- Declined payment shows user-friendly error message
- Order is not created or remains in "Pending" status
- Customer is returned to checkout page with cart intact
- Error messages are clear and actionable
- No payment is recorded for failed transactions
- System logs capture error details for debugging
- Customer can modify payment method or retry
- No duplicate orders in the system
- Order history shows failed payment attempts correctly

**Test Data**:
- Declined card test number (per Datatrans documentation)
- Insufficient funds card number
- Valid order items in cart

**Priority**: High

---

### Test Case 5: Refund and Transaction Management
**Objective**: Verify that refund operations and transaction management functions work correctly with the upgraded Datatrans module.

**Preconditions**:
- Datatrans module is configured with refund capabilities enabled
- Admin access to order management (https://docs.virtocommerce.org/user-guide/orders/)
- At least one completed order with successful Datatrans payment exists
- Datatrans API credentials have refund permissions

**Test Steps**:
1. Navigate to Orders section in admin panel
2. Open an order with completed Datatrans payment
3. Locate the payment transaction details
4. **Full Refund Test:**
   - Click "Refund" or refund action button
   - Enter full order amount
   - Add refund reason/note
   - Submit refund request
   - Verify refund processing status
5. **Partial Refund Test:**
   - Create another test order with successful payment
   - Initiate partial refund for specific amount
   - Submit partial refund
   - Verify remaining amount calculation
6. Check order status after refund
7. Verify refund transaction appears in payment history
8. Check Datatrans merchant dashboard for refund record
9. Attempt to refund already refunded order (negative test)

**Expected Results**:
- Refund option is available for completed Datatrans payments
- Full refund processes successfully
- Partial refund calculates remaining amount correctly
- Order status updates to "Refunded" or "Partially Refunded"
- Refund transaction is recorded with timestamp and amount
- Transaction ID from Datatrans is captured
- Customer receives refund confirmation (if configured)
- System prevents duplicate refunds for same transaction
- Error message displays for invalid refund attempts
- Refund appears in Datatrans dashboard
- Payment history shows complete transaction lifecycle

**Test Data**:
- Completed order with payment amount: $100.00
- Full refund amount: $100.00
- Partial refund amount: $50.00
- Refund reason: "Customer request - product defect"

**Priority**: Medium

---

## Edge Cases and Negative Tests

### Test Case 6: Module Upgrade with Existing Orders
**Objective**: Verify that existing orders with old Datatrans module version remain accessible and functional after module upgrade.

**Preconditions**:
- Previous version of Datatrans module had active orders
- Orders database contains historical Datatrans transactions
- Backup of system state before upgrade is available

**Test Steps**:
1. Query database for orders created with previous Datatrans module version
2. Open historical orders in admin panel
3. Verify all order details display correctly
4. Check payment transaction information is intact
5. Attempt to view payment details
6. Try to perform post-payment operations if applicable (refund on old orders)
7. Run order reports including old Datatrans orders
8. Verify order export includes historical Datatrans orders

**Expected Results**:
- Historical orders remain accessible
- Payment data is not corrupted or lost
- Order details display correctly
- Transaction information is preserved
- Reports include both old and new order data
- No data migration errors in logs
- Backward compatibility is maintained

**Test Data**:
- Order IDs from pre-upgrade period
- Date range: orders from last 6 months

**Priority**: Medium

---

## Notes

### Testing Environment Requirements
- Latest VirtoCommerce Platform version installed
- Datatrans test merchant account credentials
- Access to Datatrans sandbox/test environment
- Test credit card numbers from Datatrans documentation

### Dependencies
- VirtoCommerce Platform core payment infrastructure (https://docs.virtocommerce.org/platform/developer-guide/)
- Store configuration module
- Order management module
- Customer module (for checkout flow)

### Additional Testing Considerations
- Test across different browsers (Chrome, Firefox, Safari, Edge)
- Verify mobile responsiveness of Datatrans payment interface
- Test with multiple currencies if multi-currency support is enabled
- Validate PCI compliance requirements are maintained
- Check security headers and SSL/TLS connections
- Review system logs for any warnings or errors during all test scenarios
- Performance test: measure payment processing time under load

### Related Documentation
- Module Development: https://docs.virtocommerce.org/platform/developer-guide/module-development/
- Payment Configuration: https://docs.virtocommerce.org/user-guide/payment-configuration/
- Order Management: https://docs.virtocommerce.org/user-guide/orders/

### Regression Testing
- Ensure other payment methods still function correctly
- Verify existing store functionality is not impacted
- Test module can be uninstalled cleanly if needed