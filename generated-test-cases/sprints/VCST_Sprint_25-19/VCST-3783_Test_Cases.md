# Test Cases for VCST-3783: [E2E] Loyalty Information on the Frontend

## User Story Details
- **Jira Key**: VCST-3783
- **Summary**: [E2E] Loyalty Information on the Frontend
- **Priority**: Medium
- **Status**: Done
- **Created**: 8/15/2025

## Description
As a Customer, I want to see Loyalty/My Points information, on the frontend so that I can review my balance and transaction history.

---

## Test Cases

### Test Case 1: View Loyalty Points Balance
**Objective**: Verify that customers can view their current loyalty points balance

**Preconditions**:
- Customer account is created and active ([Account Management](https://docs.virtocommerce.org/user-guide/account-management/))
- Customer has accumulated loyalty points
- Customer is logged into their account
- Loyalty module is enabled ([Loyalty Module](https://docs.virtocommerce.org/modules/loyalty/))

**Test Steps**:
1. Navigate to the customer account dashboard
2. Click on "My Points" or "Loyalty" section
3. View the points balance display

**Expected Results**:
- Current points balance is displayed accurately
- Points value is formatted correctly with appropriate decimals
- Last update timestamp is shown

**Test Data**: 
- Customer account with 1000 loyalty points

**Priority**: High

---

### Test Case 2: View Transaction History
**Objective**: Verify the display of loyalty points transaction history

**Preconditions**:
- Customer is logged in
- Customer has multiple loyalty transactions
- Transaction history exists in the system

**Test Steps**:
1. Navigate to loyalty section
2. Locate transaction history list
3. Verify each transaction entry
4. Test pagination if available

**Expected Results**:
- Transaction history displays:
  - Date of transaction
  - Points earned/spent
  - Transaction description
  - Running balance
- Transactions are sorted by date (newest first)
- All transaction types are properly categorized

**Priority**: High

---

### Test Case 3: Points Earning Rules Display
**Objective**: Verify that customers can view how points are earned

**Preconditions**:
- Points earning rules are configured in the system
- Customer is logged in

**Test Steps**:
1. Navigate to loyalty section
2. Locate "How to Earn Points" or similar section
3. Review displayed earning rules

**Expected Results**:
- All active earning rules are displayed
- Point values are correctly shown
- Rules are clearly explained
- Any minimum purchase requirements are stated

**Priority**: Medium

---

### Test Case 4: Zero Balance Display
**Objective**: Verify proper display for accounts with no loyalty points

**Preconditions**:
- New customer account
- No loyalty transactions

**Test Steps**:
1. Log in with new account
2. Navigate to loyalty section
3. Check balance display
4. Check transaction history

**Expected Results**:
- Balance shows as "0" or "0.00"
- Appropriate message for empty transaction history
- Earning opportunities are highlighted

**Priority**: Medium

---

### Test Case 5: Points Expiration Information
**Objective**: Verify display of points expiration information

**Preconditions**:
- Customer has points with expiration dates
- Expiration rules are configured

**Test Steps**:
1. Navigate to loyalty section
2. Check for expiration warnings
3. View detailed expiration breakdown

**Expected Results**:
- Upcoming expirations are clearly displayed
- Amount of points expiring is shown
- Expiration dates are formatted correctly
- Warning period is appropriate

**Priority**: Medium

---

### Test Case 6: Error Handling - Invalid Access
**Objective**: Verify system behavior when accessing loyalty information without authorization

**Preconditions**:
- User is not logged in
- Direct URL to loyalty page is known

**Test Steps**:
1. Attempt to access loyalty page directly via URL while logged out
2. Click loyalty section links while logged out

**Expected Results**:
- Redirect to login page
- Appropriate error message
- No sensitive information exposed

**Priority**: High

---

## Edge Cases and Negative Tests

### Test Case 7: Large Number Handling
**Objective**: Verify system handles extremely large point values correctly

**Preconditions**:
- Account with very large point balance (e.g., 999,999,999)

**Test Steps**:
1. View balance display
2. Check transaction history
3. Verify calculations

**Expected Results**:
- Large numbers are formatted correctly
- No overflow or display issues
- Calculations remain accurate

**Priority**: Low

---

## Notes
- Integration with order management system should be verified
- Mobile responsiveness should be tested for all views
- Related to customer account management features
- Consider accessibility requirements for point balance display

The test cases focus on both functional aspects and edge cases of the loyalty information display, ensuring comprehensive coverage of the feature's requirements.