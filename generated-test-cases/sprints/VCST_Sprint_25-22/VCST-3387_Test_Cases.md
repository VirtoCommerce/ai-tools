# Test Cases for VCST-3387: [E2E] Enter Credit Card Details on Checkout Page

## User Story Details
- **Jira Key**: VCST-3387
- **Summary**: [E2E] Enter Credit Card Details on Checkout Page
- **Priority**: Medium
- **Status**: In progress
- **Created**: 6/2/2025

## Description
As a Customer, I want to securely enter my credit card details directly on the checkout page, so that I can complete my purchase smoothly and without unnecessary friction.

---

## Test Cases

### Test Case 1: Successful Credit Card Payment with Valid Details
**Objective**: Verify that a customer can successfully complete a purchase using valid credit card details

**Preconditions**:
- User is logged in
- Items are added to cart
- User is on the checkout page
- User has selected credit card as payment method

**Test Steps**:
1. Enter valid 16-digit credit card number
2. Enter valid expiration date (future date)
3. Enter valid 3-digit CVV
4. Enter cardholder name exactly as shown on card
5. Click "Submit Payment" button

**Expected Results**:
- Payment is processed successfully
- Order confirmation page is displayed
- Order confirmation email is sent
- Transaction appears in order history

**Test Data**: 
- Card Number: 4111 1111 1111 1111
- Expiry: 12/25
- CVV: 123
- Name: John Doe

**Priority**: High

---

### Test Case 2: Card Number Format Validation
**Objective**: Verify that the system properly validates credit card number format

**Preconditions**:
- User is on the checkout page
- Credit card payment method is selected

**Test Steps**:
1. Enter invalid card numbers in following formats:
   - Less than 16 digits
   - More than 16 digits
   - Non-numeric characters
   - All zeros
2. Attempt to proceed with payment

**Expected Results**:
- Real-time validation message appears
- Submit button remains disabled
- Clear error message indicates invalid card number
- System doesn't accept non-numeric characters

**Test Data**:
- Invalid numbers: "411111", "41111111111111111", "4111-1111-1111-1111", "0000000000000000"

**Priority**: High

---

### Test Case 3: Expired Card Detection
**Objective**: Verify system correctly identifies and handles expired credit cards

**Preconditions**:
- User is on the checkout page
- Credit card payment method is selected

**Test Steps**:
1. Enter valid credit card number
2. Enter past expiration date
3. Complete other fields with valid data
4. Attempt to submit payment

**Expected Results**:
- System displays expired card error message
- Payment submission is blocked
- User is prompted to use different card

**Test Data**:
- Expiry dates: Previous month, Previous year

**Priority**: Medium

---

### Test Case 4: CVV Validation
**Objective**: Verify proper validation of CVV field

**Preconditions**:
- User is on checkout page
- Valid card number and expiry date entered

**Test Steps**:
1. Test CVV with:
   - 2 digits
   - 4 digits
   - Non-numeric characters
   - Empty field
2. Attempt to submit payment

**Expected Results**:
- Error message for invalid CVV format
- Submit button disabled until valid 3-digit CVV entered
- Non-numeric characters not accepted

**Test Data**:
- Invalid CVV: "12", "1234", "ABC", ""

**Priority**: Medium

---

### Test Case 5: Card Type Detection
**Objective**: Verify system correctly identifies different card types based on number

**Preconditions**:
- User is on checkout page

**Test Steps**:
1. Enter first 4-6 digits of different card types:
   - Visa (4xxx)
   - MasterCard (51xx-55xx)
   - American Express (34xx, 37xx)
2. Observe card type indicator

**Expected Results**:
- Correct card logo appears based on number
- CVV field adjusts length requirement (4 digits for AMEX)
- Invalid card numbers show no card type

**Test Data**:
- Visa: 4111111111111111
- MasterCard: 5555555555554444
- AMEX: 371449635398431

**Priority**: Medium

---

### Test Case 6: Session Timeout Handling
**Objective**: Verify proper handling of payment session timeout

**Preconditions**:
- User is on checkout page
- Session timeout is configured

**Test Steps**:
1. Enter partial card details
2. Wait for session timeout period
3. Attempt to complete transaction
4. Observe system behavior

**Expected Results**:
- Security warning displayed
- User redirected to login
- Card details cleared
- Secure session restart required

**Priority**: High

---

### Test Case 7: Form Field Dependencies
**Objective**: Verify proper handling of form field dependencies and auto-formatting

**Preconditions**:
- User is on checkout page

**Test Steps**:
1. Enter card number with spaces
2. Enter expiry date without /
3. Paste complete card details
4. Tab through fields

**Expected Results**:
- Spaces automatically formatted in card number
- Expiry date formatted as MM/YY
- Fields auto-advance when completed
- Proper tab order maintained

**Priority**: Low

---

## Edge Cases and Negative Tests

### Test Case 8: Network Interruption During Processing
**Objective**: Verify system behavior during network issues

**Preconditions**:
- User is on checkout page
- Network interruption capability exists

**Test Steps**:
1. Enter valid card details
2. Simulate network interruption
3. Submit payment
4. Restore network
5. Observe system behavior

**Expected Results**:
- Clear error message displayed
- Transaction not double-processed
- Recovery options presented
- Order status properly maintained

**Priority**: High

---

## Notes
- All tests should be performed with various supported browsers
- Testing should include mobile responsiveness
- PCI compliance requirements must be maintained
- Related stories: Payment Gateway Integration (VCST-3386)
- Security testing should be performed separately