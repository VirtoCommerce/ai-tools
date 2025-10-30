# Test Cases for VCST-4109: [E2E] Active Session Management for OpenIdDict in Virto Commerce Accounts

## User Story Details
- **Jira Key**: VCST-4109
- **Summary**: [E2E] Active Session Management for OpenIdDict in Virto Commerce Accounts
- **Priority**: Medium
- **Status**: To Do
- **Created**: 10/14/2025

## Description
As a Virto Commerce Administrator or Security Officer, I want to review and revoke active user sessions across the platform so that I can maintain security by terminating suspicious or unauthorized sessions and help users manage their active devices.

---

## Test Cases

### Test Case 1: Regular User Session Management
**Objective**: Verify that regular users can view and manage their own sessions only

**Preconditions**:
- User has valid credentials
- User has active sessions on multiple devices

**Test Steps**:
1. Log in as a regular user
2. Navigate to session management section
3. Review list of active sessions
4. Attempt to view sessions of other users
5. Revoke one of own active sessions

**Expected Results**:
- User can see list of their own active sessions
- Cannot access or view other users' sessions
- Selected session is successfully revoked
- User remains logged in on current session

**Test Data**: 
- Regular user credentials
- Multiple active sessions

**Priority**: High

---

### Test Case 2: Administrator Session Management
**Objective**: Verify administrator capabilities for managing all users' sessions

**Preconditions**:
- Administrator account with required permissions
- Multiple users with active sessions

**Test Steps**:
1. Log in as administrator
2. Navigate to session management dashboard
3. Search for specific user's sessions
4. View detailed session information
5. Revoke selected user session
6. Attempt to revoke all sessions for a user

**Expected Results**:
- Can view all users' active sessions
- Search functionality works correctly
- Session details are displayed accurately
- Selected session is revoked successfully
- User is logged out from revoked session
- Multiple session revocation works correctly

**Priority**: High

---

### Test Case 3: Concurrent Session Handling
**Objective**: Test system behavior with multiple concurrent sessions

**Preconditions**:
- Test user account
- Multiple browsers/devices ready

**Test Steps**:
1. Log in to account from different browsers/devices
2. Verify each session appears in management console
3. Perform actions in multiple sessions simultaneously
4. Revoke session while user is active

**Expected Results**:
- All concurrent sessions are listed correctly
- Session list updates in real-time
- Revoked session terminates immediately
- Other active sessions remain unaffected

**Priority**: Medium

---

### Test Case 4: Session Information Accuracy
**Objective**: Verify accuracy of session information displayed

**Preconditions**:
- Active user session
- Various devices and browsers

**Test Steps**:
1. Log in from different devices/browsers
2. Review session details for each login
3. Verify displayed information:
   - Device type
   - Browser information
   - IP address
   - Login timestamp
   - Last activity time

**Expected Results**:
- All session information is accurate
- Details are correctly mapped to each session
- Timestamp information is in correct timezone
- Device/browser information is properly detected

**Priority**: Medium

---

### Test Case 5: Session Revocation Edge Cases
**Objective**: Test boundary conditions for session revocation

**Preconditions**:
- Multiple active sessions
- Administrative access

**Test Steps**:
1. Attempt to revoke current admin session
2. Try to revoke already expired session
3. Revoke session during active operation
4. Attempt to revoke multiple sessions simultaneously

**Expected Results**:
- Warning before revoking own session
- Appropriate error for expired session
- In-progress operations complete or fail gracefully
- Multiple revocation handles race conditions

**Priority**: Medium

---

### Test Case 6: Permission-Based Access Control
**Objective**: Verify access control for session management

**Preconditions**:
- Users with different permission levels
- Active sessions to manage

**Test Steps**:
1. Test access with no permissions
2. Test with read-only permissions
3. Test with full management permissions
4. Attempt operations with insufficient permissions

**Expected Results**:
- Access denied for unauthorized users
- Read-only users can only view sessions
- Full access users can perform all operations
- Appropriate error messages displayed

**Priority**: High

---

## Edge Cases and Negative Tests

### Test Case 7: System Resilience
**Objective**: Verify system handling of unexpected conditions

**Preconditions**:
- System under load
- Network connectivity issues simulated

**Test Steps**:
1. Test session management under heavy load
2. Attempt operations during network interruption
3. Test with invalid session tokens
4. Simulate database connectivity issues

**Expected Results**:
- System maintains stability under load
- Appropriate error handling for network issues
- Invalid sessions handled gracefully
- Data consistency maintained

**Priority**: Medium

---

## Notes
- All tests should be performed across different browsers and devices
- Session timeout settings should be configured properly
- Consider GDPR and data privacy requirements
- Test cases should be updated for specific implementation details
- Consider integration with authentication providers
- Monitor performance impact of session management operations