# TC-017: Session Expiry Handling

## Test Case Information

**Test Case ID**: TC-017  
**Test Case Title**: Verify Handling of Session Expiry During Cart Updates  
**Related Story**: [VCST-4003](https://virtocommerce.atlassian.net/browse/VCST-4003)  
**Priority**: Medium  
**Test Type**: Error Handling / Edge Case  
**Estimated Time**: 20 minutes

---

## Description

Verify that the system gracefully handles session expiry scenarios during cart quantity updates. Ensure users are properly notified, can re-authenticate without losing cart data, and have a smooth recovery experience.

---

## Preconditions

1. User is logged into the VirtoCommerce platform
2. User has products in cart
3. Ability to manipulate session (manually expire or wait for timeout)
4. Understanding of session timeout duration

---

## Test Data

- **Test User**: `test_user@example.com`
- **Session Timeout**: [Document actual timeout duration]
- **Products**: 3+ products in cart

---

## Test Steps

### Step 1: Identify Session Timeout Duration
1. Check application configuration for session timeout
2. Document the timeout period (e.g., 30 minutes, 2 hours)
3. Plan test execution around this

**Expected Result**:
- Session timeout is documented
- Test can be planned accordingly

---

### Step 2: Session Expires Before Cart Update
1. Log in and add products to cart
2. Wait for session to expire (or manually expire via dev tools)
3. After expiration, attempt to change quantity
4. Observe behavior

**Expected Result**:
- Error message shown:
  - "Your session has expired. Please log in again."
  - "Session expired. Redirecting to login..."
- User redirected to login page
- Cart data preserved if possible
- After re-login, cart state restored

---

### Step 3: Session Expires During Debounce Window
1. Make quantity change (optimistic update shown)
2. During the 1-second debounce window:
   - Manually expire session (delete auth cookie/token)
3. Wait for mutation attempt

**Expected Result**:
- Mutation fails with authentication error
- User notified of expired session
- Prompted to re-authenticate
- Cart update queued or user can retry after login

---

### Step 4: Session Expires During Pending Mutation
1. Enable slow network (Slow 3G)
2. Make quantity change (mutation sent, pending)
3. While mutation is pending:
   - Expire session
4. Mutation eventually receives response

**Expected Result**:
- Server returns 401 Unauthorized or similar
- Clear error message: "Session expired"
- User prompted to log in
- No cryptic error messages

---

### Step 5: Multiple Changes Then Session Expires
1. Make multiple quantity changes (queued/batched)
2. Expire session before mutations complete
3. Observe behavior

**Expected Result**:
- All pending mutations fail with auth error
- User notified once (not multiple error messages)
- After re-login, user can review cart and make changes again
- No data corruption

---

### Step 6: Session Expiry with Unsaved Changes
1. Make quantity changes
2. Expire session immediately
3. Try to navigate away

**Expected Result**:
- Warning about unsaved changes (if implemented)
- User aware that changes not saved
- After login, can retry changes

---

### Step 7: Re-authentication and Cart Recovery
1. Make quantity changes
2. Session expires
3. User redirected to login page
4. User logs in again
5. Verify cart state

**Expected Result**:
- After re-login, cart is restored
- Previous quantity changes may not be saved (depending on when session expired)
- User can make changes again
- No loss of cart items (only unsaved quantity changes lost)

---

### Step 8: Automatic Session Renewal (If Implemented)
1. Make cart updates regularly
2. Observe if session automatically renews
3. Check session timeout extends with activity

**Expected Result**:
- If auto-renewal: Session extends with each cart update
- User doesn't get unexpectedly logged out during active use
- Session only expires after true inactivity

---

### Step 9: Token Refresh Mechanism (If Applicable)
1. If using JWT or refresh tokens
2. Make cart update as access token is expiring
3. Observe token refresh behavior

**Expected Result**:
- System automatically refreshes access token
- Cart update succeeds seamlessly
- User unaware of token refresh
- No interruption

---

### Step 10: Session Expiry on Different Tab
**Scenario**: User has multiple tabs open
1. In Tab A: Keep session active
2. In Tab B: Let session expire
3. In Tab B: Try to update cart

**Expected Result**:
- Tab B shows session expired error
- Tab A may remain logged in (depends on implementation)
- OR both tabs detect expiry and prompt login
- Behavior is consistent

---

### Step 11: Remember Cart After Session Expiry
1. Make quantity changes
2. Session expires
3. Close browser (without logging back in)
4. Reopen browser and login

**Expected Result**:
- Cart items remembered (persisted to backend)
- Unsaved quantity changes lost
- User can resume where they left off

---

### Step 12: Guest User Session (If Applicable)
1. Browse as guest user
2. Add items to cart
3. Guest session expires
4. Make quantity changes

**Expected Result**:
- Guest cart may be stored in localStorage or cookies
- Guest session expiry handled gracefully
- User can continue or prompted to create account

---

### Step 13: CSRF Token Expiry (If Using CSRF Protection)
1. Make cart update
2. If CSRF tokens are used, expire/invalidate CSRF token
3. Attempt mutation

**Expected Result**:
- CSRF validation fails gracefully
- Error message shown
- User can refresh and retry
- No security bypass

---

### Step 14: Concurrent Session Detection
1. Log in on Browser A
2. Log in on Browser B with same account
3. In Browser A (old session), try cart update

**Expected Result**:
- Depends on session handling strategy:
  - Single session: Browser A logged out, notified
  - Multiple sessions: Both can update cart
- Clear communication to user
- No conflicts or data loss

---

## Session Expiry Error Messages

Good error messages:
- ✅ "Your session has expired for security. Please log in again."
- ✅ "You've been logged out due to inactivity. [Login]"
- ✅ "Session expired. Your cart has been saved."

Bad error messages:
- ❌ "401 Unauthorized"
- ❌ "Authentication failed"
- ❌ "Invalid token"
- ❌ Generic error with no explanation

---

## Expected Results Summary

✅ **Clear Communication**: User informed of session expiry  
✅ **Redirect to Login**: Automatic redirect to login page  
✅ **Cart Preservation**: Cart items remembered after re-login  
✅ **No Data Corruption**: Session expiry doesn't corrupt cart data  
✅ **Graceful Handling**: No crashes or confusing errors  
✅ **Token Refresh**: Automatic token renewal if implemented  
✅ **Consistent Behavior**: Same experience across all scenarios  
✅ **Security**: Proper authentication enforcement

---

## Actual Results

**Execution Date**: ___________  
**Executed By**: ___________  
**Browser**: ___________  
**Environment**: ___________

### Observations:
```
[To be filled during test execution]

Session timeout duration: ___ minutes
Session expiry error message: "___"
User redirected to login: Yes/No
Cart preserved after re-login: Yes/No
Automatic token refresh: Yes/No
Multiple sessions allowed: Yes/No

Error handling quality: Good/Poor
User experience: Smooth/Confusing
```

---

## Pass/Fail Criteria

**Pass**: 
- Clear session expiry messages
- User redirected to login appropriately
- Cart items preserved after re-login
- No data corruption or crashes
- Graceful handling in all scenarios
- Automatic token refresh works (if implemented)
- Security properly enforced

**Fail**: 
- Generic or no error messages
- No redirect or unclear next steps
- Cart data lost after re-login
- Data corruption from session expiry
- System crashes
- Security bypass possible
- Confusing user experience

---

## Status

- [ ] Not Executed
- [ ] Pass
- [ ] Fail
- [ ] Blocked

---

## Defects

| Defect ID | Description | Severity | Status |
|-----------|-------------|----------|--------|
| | | | |

---

## Notes

- Session expiry is common in real-world usage (security requirement)
- Test with actual session timeouts (may require waiting)
- Manual session expiry can speed up testing (delete cookies/tokens)
- Consider different session storage mechanisms (cookies, localStorage, server-side)
- Verify session handling complies with security best practices
- Test both registered users and guest users (if applicable)

---

## Session Testing Tools

- **Browser DevTools**:
  - Application tab → Cookies → Delete auth cookies
  - Application tab → Local Storage → Delete tokens

- **Manual Methods**:
  - Wait for actual timeout
  - Modify cookie expiration time
  - Delete session storage

- **Backend Methods** (if accessible):
  - Invalidate session in database
  - Restart session service
  - Change session secret

---

## Screenshots/Evidence

[Attach screenshots or video recordings here]

1. Session expiry error message
2. Login redirect page
3. Cart state after re-login
4. Token refresh in Network tab (if applicable)
5. Multiple pending mutations with session expiry

