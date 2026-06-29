# Test Cases for VCST-3999: Improve refund data model

## User Story Details
- **Jira Key**: VCST-3999
- **Summary**: Improve refund data model
- **Priority**: Medium
- **Status**: Done
- **Created**: 9/24/2025

## Description
Current flow in PaymentFlowService.RefundPaymentAsync:
CreateRefundDocument
Locates (or creates) a Refund entity by request.TransactionId:
Persists the Refund (with Refund.TransactionId = request.TransactionId).
ProcessRefund
Builds a RefundPaymentRequest via GetRefundPaymentRequest.
IMPORTANT: RefundPaymentRequest does not receive the TransactionId (it is not copied; the type does not expose it).
SaveResultToRefundDocument
Re-loads order and finds the refund again by request.TransactionId:

So, TransactionId is the correlation key internal to the Order module service layer. The PaymentMethod.RefundProcessPayment is intentionally isolated from refund entity selection; it operates at "payment-level" (amount, reason, etc.) and is not expected to pick a specific Refund from the PaymentIn.Refunds collection.
However, in real-world multi-refund or partial-refund scenarios, the absence of the TransactionId (or some refund identifier) inside RefundPaymentRequest makes it impossible for a payment provider implementation to.
Summary / Recommendations
•	Populate TransactionId in GetRefundPaymentRequest / GetCapturePaymentRequest.

---

## Test Cases

### Test Case 1: Verify TransactionId is Populated in RefundPaymentRequest for Single Refund
**Objective**: Verify that the TransactionId from the initial refund request is correctly populated in the RefundPaymentRequest object during the payment refund processing flow.

**Preconditions**:
- VirtoCommerce platform is installed and configured (https://docs.virtocommerce.org/platform/user-guide/)
- Order module is installed and configured (https://docs.virtocommerce.org/modules/order/)
- A completed order with a captured payment exists in the system
- Payment gateway/provider supports refund operations (https://docs.virtocommerce.org/modules/payment/)
- User has permission to process refunds

**Test Steps**:
1. Navigate to Orders module and locate an order with a captured payment
2. Initiate a refund request via PaymentFlowService.RefundPaymentAsync with a valid TransactionId
3. During CreateRefundDocument phase, verify that Refund entity is created/located with the provided TransactionId
4. During ProcessRefund phase, intercept or log the RefundPaymentRequest object created by GetRefundPaymentRequest method
5. Verify that RefundPaymentRequest contains the TransactionId field and its value matches the original request.TransactionId
6. Complete the refund process and verify SaveResultToRefundDocument successfully locates the refund using TransactionId

**Expected Results**:
- RefundPaymentRequest object contains a TransactionId property
- The TransactionId value in RefundPaymentRequest matches the original request.TransactionId
- Payment provider can access the TransactionId to correlate the refund operation
- Refund is successfully processed and saved with proper transaction correlation
- Order payment status is updated correctly to reflect the refund

**Test Data**: 
- Order ID: Test-Order-001
- Original TransactionId: "TXN-REF-12345678"
- Refund Amount: $50.00

**Priority**: High

---

### Test Case 2: Verify TransactionId Population in Multiple Partial Refunds Scenario
**Objective**: Verify that each partial refund request maintains its unique TransactionId in RefundPaymentRequest, enabling payment providers to distinguish between multiple refunds on the same payment.

**Preconditions**:
- VirtoCommerce platform is installed and configured
- Order module is configured to support partial refunds (https://docs.virtocommerce.org/modules/order/)
- A completed order with a captured payment of $200.00 exists
- Payment gateway supports multiple partial refunds
- User has permission to process multiple refunds

**Test Steps**:
1. Create first partial refund request for $50.00 with TransactionId "TXN-REF-001"
2. Verify GetRefundPaymentRequest populates RefundPaymentRequest with TransactionId "TXN-REF-001"
3. Complete first refund and verify it's saved with correct TransactionId
4. Create second partial refund request for $30.00 with TransactionId "TXN-REF-002"
5. Verify GetRefundPaymentRequest populates RefundPaymentRequest with TransactionId "TXN-REF-002"
6. Complete second refund and verify both refunds exist in PaymentIn.Refunds collection with distinct TransactionIds
7. Verify payment provider received distinct TransactionIds for each refund operation
8. Verify each refund can be independently identified and tracked by its TransactionId

**Expected Results**:
- Each RefundPaymentRequest contains its unique TransactionId
- Payment provider receives distinct TransactionIds for each refund call
- Order contains multiple refund records with correct individual TransactionIds
- Total refunded amount is correctly calculated ($80.00)
- Each refund operation can be traced independently using its TransactionId
- No conflict or overwriting occurs between multiple refund transactions

**Test Data**: 
- Order ID: Test-Order-002
- Original Payment Amount: $200.00
- First Refund: $50.00, TransactionId: "TXN-REF-001"
- Second Refund: $30.00, TransactionId: "TXN-REF-002"
- Remaining Payment: $120.00

**Priority**: High

---

### Test Case 3: Verify TransactionId is Populated in CapturePaymentRequest
**Objective**: Verify that similar to refund flow, the TransactionId is properly populated in CapturePaymentRequest via GetCapturePaymentRequest method for payment capture operations.

**Preconditions**:
- VirtoCommerce platform is installed and configured
- Order with authorized (but not captured) payment exists (https://docs.virtocommerce.org/modules/order/)
- Payment method supports two-phase commit (authorize/capture)
- User has permission to capture payments

**Test Steps**:
1. Navigate to Orders module and locate an order with authorized payment
2. Initiate payment capture via PaymentFlowService with a valid TransactionId
3. During capture processing, intercept the CapturePaymentRequest object created by GetCapturePaymentRequest
4. Verify that CapturePaymentRequest contains the TransactionId field
5. Verify the TransactionId value matches the authorization TransactionId
6. Complete the capture operation
7. Verify the payment provider received the TransactionId in the capture request
8. Verify the captured payment record contains the correct TransactionId

**Expected Results**:
- CapturePaymentRequest object contains a TransactionId property
- The TransactionId matches the original authorization transaction
- Payment provider can correlate the capture operation with the authorization
- Payment status changes from Authorized to Paid
- TransactionId is persisted correctly in the payment record

**Test Data**: 
- Order ID: Test-Order-003
- Authorization TransactionId: "TXN-AUTH-98765"
- Capture Amount: $150.00

**Priority**: High

---

### Test Case 4: Verify TransactionId Handling When Refund Request Fails at Payment Provider
**Objective**: Verify that when a payment provider fails to process a refund, the TransactionId is still maintained in the error response and logging for troubleshooting purposes.

**Preconditions**:
- VirtoCommerce platform is installed and configured
- Order with captured payment exists
- Payment provider is configured to simulate refund failures (https://docs.virtocommerce.org/modules/payment/)
- Logging is enabled for payment operations
- User has permission to process refunds

**Test Steps**:
1. Create a refund request with TransactionId "TXN-REF-ERROR-001"
2. Configure payment provider to reject/fail the refund operation
3. Execute RefundPaymentAsync and observe the error handling in ProcessRefund phase
4. Verify that the RefundPaymentRequest sent to payment provider contains the TransactionId
5. Verify the error response or exception includes the TransactionId for correlation
6. Check SaveResultToRefundDocument phase and verify it can still locate the refund by TransactionId
7. Verify the refund record is updated with failed status and retains the TransactionId
8. Review logs to confirm TransactionId is present throughout the error flow

**Expected Results**:
- RefundPaymentRequest contains TransactionId even when operation fails
- Error messages and exceptions include the TransactionId for troubleshooting
- Failed refund record is saved with correct TransactionId and error status
- TransactionId enables support team to trace the failed refund operation
- System maintains data integrity despite the failure
- Logs contain sufficient information to debug using TransactionId

**Test Data**: 
- Order ID: Test-Order-004
- TransactionId: "TXN-REF-ERROR-001"
- Refund Amount: $75.00
- Expected Error: "Payment provider declined refund"

**Priority**: Medium

---

### Test Case 5: Verify TransactionId Uniqueness and Validation in Concurrent Refund Requests
**Objective**: Verify that the system properly handles concurrent refund requests with unique TransactionIds and prevents duplicate processing or TransactionId conflicts.

**Preconditions**:
- VirtoCommerce platform is installed with high-concurrency support configured
- Order with captured payment of $300.00 exists
- Multiple users have permission to process refunds
- Database supports transaction isolation (https://docs.virtocommerce.org/platform/)

**Test Steps**:
1. Prepare three concurrent refund requests for the same order:
   - Request A: $50.00, TransactionId: "TXN-REF-CONC-001"
   - Request B: $75.00, TransactionId: "TXN-REF-CONC-002"
   - Request C: $100.00, TransactionId: "TXN-REF-CONC-003"
2. Submit all three refund requests simultaneously to PaymentFlowService.RefundPaymentAsync
3. Verify each CreateRefundDocument creates/locates a distinct Refund entity by its unique TransactionId
4. Verify each GetRefundPaymentRequest creates a RefundPaymentRequest with its correct TransactionId
5. Verify payment provider receives three distinct refund calls with proper TransactionIds
6. Verify SaveResultToRefundDocument correctly saves each refund with its respective TransactionId
7. Verify no TransactionId collision or overwriting occurs
8. Verify the order's PaymentIn.Refunds collection contains all three refunds with unique TransactionIds
9. Verify total refunded amount is correctly calculated ($225.00)

**Expected Results**:
- Each concurrent refund maintains its unique TransactionId throughout the flow
- No race conditions or duplicate TransactionId issues occur
- All three RefundPaymentRequests contain their respective unique TransactionIds
- Payment provider successfully processes all three refunds independently
- Order contains three distinct refund records, each identifiable by TransactionId
- Data integrity is maintained under concurrent load
- Total refund amount and remaining payment amount are accurate

**Test Data**: 
- Order ID: Test-Order-005
- Original Payment: $300.00
- Concurrent Refunds:
  - Refund A: $50.00, "TXN-REF-CONC-001"
  - Refund B: $75.00, "TXN-REF-CONC-002"
  - Refund C: $100.00, "TXN-REF-CONC-003"
- Total Refunded: $225.00
- Remaining: $75.00

**Priority**: Medium

---

## Edge Cases and Negative Tests

### Covered in Test Cases Above
- **Test Case 2**: Handles multiple partial refunds (edge case for complex refund scenarios)
- **Test Case 4**: Negative test for payment provider failures
- **Test Case 5**: Edge case for concurrent operations and uniqueness validation

---

## Notes
- All test cases assume the improvement has been implemented (TransactionId now populates in RefundPaymentRequest and CapturePaymentRequest)
- Payment provider implementations should be updated to utilize the TransactionId for better transaction correlation
- Integration testing with actual payment gateways (Stripe, PayPal, Authorize.Net) is recommended to verify real-world compatibility
- Performance testing should be conducted for scenarios with high volumes of refund operations
- Documentation should be updated to reflect the new TransactionId availability in payment requests
- Consider backward compatibility testing if existing payment provider integrations rely on the old behavior
- Related documentation: 
  - Order Module: https://docs.virtocommerce.org/modules/order/
  - Payment Module: https://docs.virtocommerce.org/modules/payment/
  - Platform Configuration: https://docs.virtocommerce.org/platform/