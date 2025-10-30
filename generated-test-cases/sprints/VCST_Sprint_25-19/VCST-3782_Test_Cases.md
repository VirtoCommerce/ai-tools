# Test Cases for VCST-3782: Loyalty Payment Method

## User Story Details
- **Jira Key**: VCST-3782
- **Summary**: Loyalty Payment Method
- **Priority**: Medium
- **Status**: Done
- **Created**: 8/15/2025

## Description
As an ECommerce Administrator, I want to setup Loyalty Points as Payment method for the store, I Points 1 - 1 Currency, so that customers can spend points and buy products on the loyalty portal.

---

## Test Cases

### Test Case 1: Configure Loyalty Points Payment Method
**Objective**: Verify that an administrator can successfully configure Loyalty Points as a payment method

**Preconditions**:
- Admin has access to Commerce Manager [Platform Manager Overview](https://docs.virtocommerce.org/platform-manager/overview/)
- Valid store exists in the system
- Admin has appropriate permissions [Security](https://docs.virtocommerce.org/user_docs/configuration-security/)

**Test Steps**:
1. Login to Commerce Manager as administrator
2. Navigate to Settings → Payment Methods
3. Click "Add" to create new payment method
4. Configure the following settings:
   - Name: "Loyalty Points"
   - Code: "LoyaltyPoints"
   - Description: "Pay with loyalty points"
   - Is Active: Yes
   - Currency: Select store currency
5. Set conversion rate 1 point = 1 currency unit
6. Save configuration

**Expected Results**:
- Payment method is successfully created
- Configuration is saved without errors
- New payment method appears in the list of available payment methods

**Test Data**: 
- Payment Method Name: "Loyalty Points"
- Conversion Rate: 1:1

**Priority**: High

---

### Test Case 2: Verify Loyalty Points Balance Display
**Objective**: Ensure customer's loyalty points balance is correctly displayed during checkout

**Preconditions**:
- Customer account exists with loyalty points balance
- Loyalty Points payment method is configured
- Customer is logged in [Customer Management](https://docs.virtocommerce.org/user_docs/customers-management/)

**Test Steps**:
1. Add items to cart
2. Proceed to checkout
3. Select payment method
4. Verify loyalty points balance display
5. Verify available points for use

**Expected Results**:
- Current loyalty points balance is accurately displayed
- Available points for purchase are correctly calculated
- Balance is shown in both points and equivalent currency value

**Test Data**: 
- Customer with 1000 loyalty points
- Cart with items worth 500 currency units

**Priority**: High

---

### Test Case 3: Partial Payment with Loyalty Points
**Objective**: Verify that customers can use loyalty points for partial payment

**Preconditions**:
- Customer has insufficient points for full payment
- Multiple payment methods are enabled
- Cart contains valid items

**Test Steps**:
1. Proceed to checkout with items
2. Select Loyalty Points as first payment method
3. Enter amount of points to use
4. Select secondary payment method for remaining balance
5. Complete checkout

**Expected Results**:
- System correctly splits payment between points and secondary method
- Points balance is accurately deducted
- Remaining amount is charged to secondary payment method

**Test Data**: 
- Cart total: 1000 currency units
- Available points: 600
- Secondary payment method: Credit Card

**Priority**: Medium

---

### Test Case 4: Negative Test - Insufficient Points
**Objective**: Verify system behavior when attempting to use more points than available

**Preconditions**:
- Customer account has defined point balance
- Cart contains items with total exceeding points balance

**Test Steps**:
1. Attempt to use more points than available balance
2. Try to proceed with checkout

**Expected Results**:
- System displays error message
- Prevents proceeding with invalid points amount
- Suggests available balance usage

**Test Data**: 
- Available points: 100
- Attempted use: 150 points

**Priority**: Medium

---

### Test Case 5: Points Refund Process
**Objective**: Verify proper handling of loyalty points refund

**Preconditions**:
- Completed order using loyalty points
- Admin has refund permissions
- Order is eligible for refund

**Test Steps**:
1. Access order management
2. Initiate refund process
3. Select points refund option
4. Process refund

**Expected Results**:
- Points are correctly returned to customer account
- Refund transaction is properly recorded
- Customer receives notification

**Test Data**: 
- Order amount: 500 points
- Refund amount: 500 points

**Priority**: High

---

### Test Case 6: Points Expiration Handling
**Objective**: Verify system handles expired points correctly during payment

**Preconditions**:
- Customer has points with different expiration dates
- Some points are expired

**Test Steps**:
1. Attempt to use points for payment
2. Verify available points calculation
3. Complete transaction

**Expected Results**:
- Only valid, non-expired points are available for use
- Expired points are not included in available balance
- System uses oldest non-expired points first

**Test Data**: 
- Total points: 1000
- Expired points: 200
- Valid points: 800

**Priority**: Medium

---

## Notes
- Integration with existing loyalty system must be verified
- Payment method should be tested across different stores if applicable
- Performance testing recommended for high-volume transactions
- Consider testing with different currency conversion rates

Related Documentation:
- [Payment Methods](https://docs.virtocommerce.org/user_docs/payments/)
- [Order Management](https://docs.virtocommerce.org/user_docs/order-management/)