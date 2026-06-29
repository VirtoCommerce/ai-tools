# Test Cases for VCST-3961: transactionId should be auto-generated to ensure uniqueness and avoid duplicates

## User Story Details
- **Jira Key**: VCST-3961
- **Summary**: transactionId should be auto-generated to ensure uniqueness and avoid duplicates
- **Priority**: High
- **Status**: Done
- **Created**: 9/19/2025

## Description
As an Order Manager, I want to have auto-generated transactionId for capture and refund documents in the Virto Commerce so that it allows to ensure uniqueness and avoid duplicates

---

## Test Cases

### Test Case 1: Verify Auto-Generated Transaction ID for Capture Payment
**Objective**: Verify that a unique transactionId is automatically generated when creating a capture payment transaction

**Preconditions**:
- User has Order Manager role with appropriate permissions
- At least one order exists with authorized payment that can be captured
- Payment gateway is configured and connected (https://docs.virtocommerce.org/platform/developer-guide/Modules/Payment-Module/)
- User is logged into Virto Commerce Platform

**Test Steps**:
1. Navigate to Orders module in Virto Commerce Platform (https://docs.virtocommerce.org/user-guide/orders/)
2. Select an order with authorized payment status
3. Open the order details page
4. Click on "Payments" section
5. Click "Capture" button for the authorized payment
6. Complete the capture operation without manually entering any transactionId
7. Observe the generated payment transaction record
8. Note the transactionId value in the capture document

**Expected Results**:
- TransactionId is automatically generated without requiring manual input
- TransactionId field is populated with a unique identifier
- TransactionId format follows system conventions (alphanumeric, appropriate length)
- Capture transaction is successfully saved with the auto-generated transactionId
- TransactionId is visible in the payment transaction details

**Test Data**: 
- Order ID: Any order with authorized payment
- Payment amount: Valid amount within authorized range

**Priority**: High

---

### Test Case 2: Verify Auto-Generated Transaction ID for Refund Payment
**Objective**: Verify that a unique transactionId is automatically generated when creating a refund transaction

**Preconditions**:
- User has Order Manager role with appropriate permissions
- At least one order exists with captured/completed payment that can be refunded
- Payment gateway supports refund operations (https://docs.virtocommerce.org/platform/developer-guide/Modules/Payment-Module/)
- User is logged into Virto Commerce Platform

**Test Steps**:
1. Navigate to Orders module (https://docs.virtocommerce.org/user-guide/orders/)
2. Select an order with captured payment status
3. Open the order details page
4. Click on "Payments" section
5. Click "Refund" button for the captured payment
6. Enter refund amount (full or partial)
7. Complete the refund operation without manually entering any transactionId
8. Observe the generated refund transaction record
9. Verify the transactionId in the refund document

**Expected Results**:
- TransactionId is automatically generated for the refund transaction
- TransactionId is unique and different from the original capture transactionId
- TransactionId field is non-editable and system-generated
- Refund transaction is successfully saved with the auto-generated transactionId
- TransactionId is displayed in the transaction history

**Test Data**: 
- Order ID: Any order with captured payment
- Refund amount: Full or partial refund amount

**Priority**: High

---

### Test Case 3: Verify Uniqueness of Transaction IDs Across Multiple Captures
**Objective**: Verify that each capture transaction generates a unique transactionId, even when multiple captures are performed in quick succession

**Preconditions**:
- User has Order Manager role with appropriate permissions
- Multiple orders exist with authorized payments available for capture
- Payment gateway is configured (https://docs.virtocommerce.org/platform/developer-guide/Modules/Payment-Module/)
- User is logged into Virto Commerce Platform

**Test Steps**:
1. Navigate to Orders module (https://docs.virtocommerce.org/user-guide/orders/)
2. Identify at least 3-5 orders with authorized payments
3. Perform capture operation on the first order payment and note the transactionId
4. Immediately perform capture operation on the second order payment and note the transactionId
5. Continue capturing payments for remaining orders in quick succession
6. Collect all generated transactionIds
7. Compare all transactionIds to verify uniqueness
8. Query the database or use API to retrieve all capture transactions and verify no duplicate transactionIds exist

**Expected Results**:
- Each capture transaction has a unique transactionId
- No duplicate transactionIds exist across all capture transactions
- TransactionIds remain unique even when created within milliseconds of each other
- System maintains transactionId uniqueness across concurrent operations
- All transactions are successfully saved without conflicts

**Test Data**: 
- Minimum 5 orders with authorized payments
- Capture amount: Valid amounts for each order

**Priority**: High

---

### Test Case 4: Verify Uniqueness of Transaction IDs Across Capture and Refund Operations
**Objective**: Verify that transactionIds are unique across both capture and refund operations for the same order

**Preconditions**:
- User has Order Manager role with appropriate permissions
- At least one order exists that will go through complete payment lifecycle (authorize → capture → refund)
- Payment gateway is configured (https://docs.virtocommerce.org/platform/developer-guide/Modules/Payment-Module/)
- User is logged into Virto Commerce Platform

**Test Steps**:
1. Navigate to Orders module (https://docs.virtocommerce.org/user-guide/orders/)
2. Select an order with authorized payment
3. Perform capture operation and record the generated transactionId (Transaction_ID_1)
4. Wait for capture to complete successfully
5. Perform refund operation (full or partial) on the same payment
6. Record the generated transactionId for the refund (Transaction_ID_2)
7. Compare Transaction_ID_1 and Transaction_ID_2
8. Review payment transaction history for the order
9. Verify that all transactionIds in the payment lifecycle are unique

**Expected Results**:
- Capture transactionId (Transaction_ID_1) is auto-generated and unique
- Refund transactionId (Transaction_ID_2) is auto-generated and unique
- Transaction_ID_1 ≠ Transaction_ID_2
- Each transaction in the payment lifecycle maintains a distinct transactionId
- Transaction history shows all unique transactionIds chronologically
- No transactionId collision occurs within the same order's payment operations

**Test Data**: 
- Order ID: Single order for complete payment lifecycle testing
- Payment amount: Valid amount for capture and subsequent refund

**Priority**: High

---

### Test Case 5: Verify Transaction ID Generation During Concurrent Payment Operations
**Objective**: Verify that the system handles concurrent capture/refund operations across multiple orders without generating duplicate transactionIds

**Preconditions**:
- User has Order Manager role with appropriate permissions
- Multiple orders (minimum 10) are ready for payment operations (captures and refunds)
- Payment gateway is configured and operational (https://docs.virtocommerce.org/platform/developer-guide/Modules/Payment-Module/)
- Test environment supports concurrent operations
- Multiple user sessions or API clients are available for concurrent testing

**Test Steps**:
1. Set up multiple concurrent sessions (via UI or API)
2. Prepare 10+ payment operations (mix of captures and refunds) across different orders
3. Execute all payment operations simultaneously or within a very short time window (< 1 second)
4. Collect all generated transactionIds from the responses
5. Query the system to retrieve all payment transactions created during the test window
6. Analyze the complete set of transactionIds for any duplicates
7. Verify database integrity constraints for transactionId uniqueness
8. Check system logs for any transactionId generation conflicts or errors

**Expected Results**:
- All concurrent payment operations complete successfully
- Each operation generates a unique transactionId
- No duplicate transactionIds exist in the result set
- Database constraints prevent any duplicate transactionId insertion
- System handles concurrent transactionId generation without race conditions
- No errors or warnings appear in system logs related to transactionId generation
- All payment transactions are properly recorded with unique identifiers

**Test Data**: 
- Minimum 10 orders with mix of authorized and captured payments
- Concurrent operations: 10+ simultaneous capture/refund requests
- Test environment: Multi-threaded or multi-user setup

**Priority**: High

---

## Edge Cases and Negative Tests

**Note**: Given the requirement to limit test cases to 5, edge cases and negative scenarios have been integrated into the test cases above. Specific areas covered include:
- Concurrent operations (Test Case 5)
- Multiple operations in quick succession (Test Case 3)
- Different transaction types uniqueness (Test Case 4)
- Lifecycle completeness (Test Case 4)

---

## Notes
- TransactionId generation mechanism should be tested across different payment gateways if multiple gateways are configured
- Performance testing should be considered for high-volume transaction scenarios
- Database uniqueness constraints should be verified as a safety mechanism
- Related documentation: https://docs.virtocommerce.org/platform/developer-guide/Modules/Payment-Module/
- API testing should complement UI testing for comprehensive coverage
- Consider testing transactionId persistence across system restarts and database backups
- Verify that transactionIds are included in order export and reporting features
- Monitor for any payment gateway-specific transactionId requirements or limitations