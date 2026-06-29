# Test Cases for VCST-3963: All refund actions (edit, cancel, delete) should be added to the change history for transparency

## User Story Details
- **Jira Key**: VCST-3963
- **Summary**: All refund actions (edit, cancel, delete) should be added to the change history for transparency
- **Priority**: Medium
- **Status**: Done
- **Created**: 9/19/2025

## Description
As a Order Manager, I want to see that capture, refund actions (edit, cancel, delete) are added to the change history for transparency

---

## Test Cases

### Test Case 1: Verify Refund Creation is Logged in Change History
**Objective**: Validate that when a refund is created for an order, the action is properly recorded in the order's change history with all relevant details.

**Preconditions**:
- User has Order Manager role with permissions to manage orders and refunds ([Order Management Overview](https://docs.virtocommerce.org/platform/user-guide/orders/))
- At least one completed order with captured payment exists in the system
- Order has available amount for refund
- User is logged into Virto Commerce Platform

**Test Steps**:
1. Navigate to Orders module in the Virto Commerce platform
2. Search and open an order with captured payment status
3. Navigate to the Payments section of the order
4. Create a new refund by clicking "Create Refund" button
5. Enter refund amount (partial or full), reason, and any additional notes
6. Save the refund transaction
7. Navigate to the "Change History" or "Activity Log" section of the order
8. Locate the most recent entry related to refund creation

**Expected Results**:
- Refund is successfully created and visible in the order's payment section
- Change history contains a new entry with timestamp of refund creation
- Entry shows action type as "Refund Created" or similar
- Entry displays refund amount, currency, and refund reason
- Entry shows the user who performed the action (Order Manager username)
- Change history entry is displayed in chronological order

**Test Data**: 
- Order ID with captured payment
- Refund amount: $50.00 (for an order total of $100.00)
- Refund reason: "Customer returned product"

**Priority**: High

---

### Test Case 2: Verify Refund Edit Action is Tracked in Change History
**Objective**: Ensure that modifications to an existing refund (before processing) are properly logged in the change history with before/after values.

**Preconditions**:
- User has Order Manager role with appropriate permissions
- An order exists with a pending/draft refund that hasn't been processed yet
- User is logged into Virto Commerce Platform

**Test Steps**:
1. Navigate to Orders module and open an order with an existing pending refund
2. Access the refund details from the Payments section
3. Click "Edit" on the pending refund
4. Modify refund amount from original value to a new value
5. Update the refund reason/notes
6. Save the changes
7. Navigate to the order's Change History section
8. Verify the edit action is logged with details

**Expected Results**:
- Refund is successfully updated with new values
- Change history contains a new entry for "Refund Edited" or "Refund Modified"
- Entry shows timestamp and user who made the modification
- Entry displays both original values and new values (e.g., "Amount changed from $50.00 to $75.00")
- Entry shows changes to refund reason/notes if modified
- All changes are tracked as separate fields within the same history entry

**Test Data**: 
- Original refund amount: $50.00
- Updated refund amount: $75.00
- Original reason: "Customer returned product"
- Updated reason: "Product damaged - customer returned"

**Priority**: High

---

### Test Case 3: Verify Refund Cancellation is Recorded in Change History
**Objective**: Validate that canceling a refund transaction is properly logged in the change history with cancellation reason and relevant details.

**Preconditions**:
- User has Order Manager role with refund management permissions
- An order exists with a pending or created refund that can be cancelled
- Refund has not been fully processed/completed
- User is logged into Virto Commerce Platform

**Test Steps**:
1. Navigate to Orders module and select an order with an existing refund
2. Open the order details and navigate to Payments section
3. Locate the refund transaction
4. Click "Cancel" or "Cancel Refund" button
5. Enter cancellation reason in the prompt/dialog (e.g., "Customer changed mind")
6. Confirm the cancellation action
7. Navigate to the Change History section of the order
8. Verify the cancellation is logged

**Expected Results**:
- Refund status changes to "Cancelled" in the order
- Change history contains a new entry for "Refund Cancelled"
- Entry includes timestamp of cancellation
- Entry displays the user who cancelled the refund
- Cancellation reason is visible in the history entry
- Original refund amount and details are still visible in the history entry
- Change history maintains chronological order of all refund-related actions

**Test Data**: 
- Refund amount: $100.00
- Cancellation reason: "Customer changed mind - keeping the product"

**Priority**: High

---

### Test Case 4: Verify Refund Deletion is Logged in Change History
**Objective**: Ensure that permanent deletion of a refund record is tracked in change history with all relevant information preserved for audit purposes.

**Preconditions**:
- User has Order Manager role with delete permissions
- An order exists with a refund that is in a state allowing deletion (e.g., draft/pending)
- User is logged into Virto Commerce Platform

**Test Steps**:
1. Navigate to Orders module and open an order with an existing refund
2. Access the Payments section showing the refund details
3. Select the refund to be deleted
4. Click "Delete" or "Remove Refund" button
5. Confirm deletion in the confirmation dialog
6. Verify refund is removed from the active payments list
7. Navigate to the Change History section
8. Search for the deletion entry in the history

**Expected Results**:
- Refund is successfully deleted from the active payments section
- Change history contains a new entry for "Refund Deleted"
- Entry includes complete details of the deleted refund (amount, currency, reason, original creation date)
- Entry shows timestamp of deletion
- Entry displays the user who performed the deletion
- Deleted refund information is preserved in history for audit trail
- History entry clearly indicates this was a deletion action

**Test Data**: 
- Deleted refund amount: $45.00
- Original refund reason: "Test refund - created in error"

**Priority**: High

---

### Test Case 5: Verify Capture Action is Tracked in Change History
**Objective**: Validate that payment capture actions are properly logged in the order's change history alongside refund actions for complete payment transaction transparency.

**Preconditions**:
- User has Order Manager role with payment management permissions ([Payment Management](https://docs.virtocommerce.org/platform/user-guide/orders/))
- An order exists with authorized but not captured payment
- User is logged into Virto Commerce Platform

**Test Steps**:
1. Navigate to Orders module and open an order with authorized payment
2. Navigate to the Payments section
3. Locate the authorized payment transaction
4. Click "Capture" or "Capture Payment" button
5. Confirm the capture amount (full or partial)
6. Submit the capture action
7. Navigate to the Change History section
8. Verify capture action is logged in history

**Expected Results**:
- Payment is successfully captured and status updated
- Change history contains a new entry for "Payment Captured"
- Entry includes timestamp of capture
- Entry shows captured amount and currency
- Entry displays the user who performed the capture
- Capture entry appears in chronological order with other payment actions (refunds, edits, etc.)
- Change history provides complete audit trail of all payment-related actions

**Test Data**: 
- Order total: $200.00
- Authorized amount: $200.00
- Captured amount: $200.00 (full capture)

**Priority**: Medium

---

## Edge Cases and Negative Tests

### Test Case 6: Verify Multiple Consecutive Refund Actions are All Logged Separately
**Objective**: Ensure that performing multiple refund operations in quick succession results in distinct, separate entries in the change history without any actions being overwritten or missed.

**Preconditions**:
- User has Order Manager permissions
- An order exists with captured payment allowing multiple refund operations
- User is logged into Virto Commerce Platform

**Test Steps**:
1. Navigate to an order with captured payment
2. Create a first partial refund (e.g., $25.00)
3. Immediately create a second partial refund (e.g., $30.00)
4. Edit the second refund to change the amount (e.g., to $35.00)
5. Cancel the first refund
6. Navigate to Change History section
7. Verify all four actions are logged as separate entries

**Expected Results**:
- All four actions appear as distinct entries in change history
- Each entry has correct timestamp showing the sequence of operations
- No actions are missing from the history
- Each entry contains accurate details specific to that action
- Entries are displayed in correct chronological order
- System handles rapid successive actions without data loss

**Test Data**: 
- First refund: $25.00
- Second refund: $30.00, then edited to $35.00
- Order total: $150.00

**Priority**: Medium

---

## Notes
- All change history entries should include timestamp, user identification, and action-specific details
- Change history should be immutable - entries cannot be edited or deleted by users
- The audit trail is critical for compliance and dispute resolution
- Consider testing with different user roles to ensure proper permission enforcement
- Related documentation: [Order Management](https://docs.virtocommerce.org/platform/user-guide/orders/)
- Performance testing may be needed if change history grows large over time
- Integration testing with payment gateways may be required to ensure external refund operations are also logged