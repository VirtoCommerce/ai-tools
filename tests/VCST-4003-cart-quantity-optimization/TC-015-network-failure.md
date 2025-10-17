# TC-015: Network Failure and Offline Scenarios

## Test Case Information

**Test Case ID**: TC-015  
**Test Case Title**: Verify Handling of Network Failures and Offline Scenarios  
**Related Story**: [VCST-4003](https://virtocommerce.atlassian.net/browse/VCST-4003)  
**Priority**: High  
**Test Type**: Error Handling / Edge Case  
**Estimated Time**: 15 minutes

---

## Description

Verify that the system gracefully handles network failures, offline scenarios, and intermittent connectivity issues. Ensure users receive clear error messages and can recover from network issues without losing data or experiencing crashes.

---

## Preconditions

1. User is logged into the VirtoCommerce platform
2. User is on a category page with products in cart
3. Browser DevTools available for network manipulation
4. Ability to simulate network conditions

---

## Test Data

- **Test User**: `test_user@example.com`
- **Products**: At least 3 products in cart

---

## Test Steps

### Step 1: Complete Network Disconnection Before Mutation
1. Make a quantity change (optimistic UI update)
2. **Before mutation is sent** (within debounce window):
   - Open DevTools → Network tab
   - Enable "Offline" mode
3. Wait for attempted mutation

**Expected Result**:
- UI shows optimistic update initially
- Mutation fails to send (network offline)
- Clear error message displayed:
  - "Unable to update cart. Please check your connection."
  - OR "Cart update failed. You are offline."
- Optimistic update may revert OR remain with error indicator
- User can retry after reconnecting

---

### Step 2: Network Disconnection During Pending Mutation
1. Enable network throttling (Slow 3G)
2. Make quantity change
3. Wait for mutation to be sent (pending)
4. While mutation is pending:
   - Switch to "Offline" mode
5. Observe behavior

**Expected Result**:
- Mutation request fails/times out
- Error message displayed
- User notified of connection issue
- Option to retry
- No data corruption

---

### Step 3: Intermittent Connection (Flaky Network)
1. Make quantity changes
2. Rapidly toggle between:
   - Online
   - Offline
   - Online
3. Observe mutation behavior

**Expected Result**:
- System attempts to send when online
- Queues or retries when connection returns
- Eventually succeeds or shows clear error
- Doesn't enter invalid state

---

### Step 4: Timeout Scenario
1. Enable extreme network throttling or simulate very slow response
2. Make quantity change
3. Wait for timeout (if configured)

**Expected Result**:
- Request times out after reasonable period (30-60s)
- Timeout error message shown
- User can retry
- System doesn't hang indefinitely

---

### Step 5: Partial Network Failure (Some Requests Succeed, Some Fail)
1. Make multiple quantity changes (triggering batched mutation)
2. Simulate network failure just as mutation is sent
3. Some requests may succeed, others fail

**Expected Result**:
- System identifies which updates failed
- Partial success handled gracefully
- User notified which items updated and which failed
- Option to retry failed items only

---

### Step 6: Reconnection and Retry
1. Make quantity change
2. Go offline (mutation fails)
3. Reconnect to network
4. Click "Retry" button (if available)

**Expected Result**:
- Retry button works
- Mutation succeeds after reconnection
- Cart synchronized correctly
- User experience smooth

---

### Step 7: Automatic Retry Logic (If Implemented)
1. Make quantity change
2. Go offline
3. Reconnect automatically
4. Observe if system auto-retries

**Expected Result**:
- If auto-retry implemented:
  - System automatically retries after reconnection
  - User notified of retry attempt
  - Success message after retry succeeds
- If no auto-retry:
  - Manual retry option available

---

### Step 8: Multiple Failed Mutations in Queue
1. Enable offline mode
2. Make 5 quantity changes (all fail, queued)
3. Reconnect
4. Observe queue processing

**Expected Result**:
- All queued changes retry after reconnection
- Processed in order
- User notified of progress
- All changes eventually applied OR clear errors shown

---

### Step 9: Browser Navigation During Offline
1. Make quantity change
2. Go offline (mutation pending/failed)
3. Try to navigate away

**Expected Result**:
- Warning shown about unsaved changes
- User can choose to stay or leave
- If stay, can retry after reconnection

---

### Step 10: Data Persistence After Offline Recovery
1. Make quantity changes
2. Go offline
3. Reconnect and retry
4. Refresh page
5. Verify quantities

**Expected Result**:
- After successful retry, data persists
- After page refresh, quantities match
- No data loss

---

### Step 11: Offline Detection UI
1. Disconnect network
2. Observe if any offline indicator shown

**Expected Result**:
- System may show offline indicator:
  - Banner at top: "You are offline"
  - Icon in header
  - Alert message
- User aware of connectivity status

---

### Step 12: Service Worker / PWA Behavior (If Applicable)
1. If app is PWA with service worker
2. Go offline
3. Attempt cart updates

**Expected Result**:
- Service worker handles offline gracefully
- May cache updates for later sync
- Clear communication to user about offline status

---

## Error Message Examples

Good error messages:
- ✅ "Unable to update cart. Please check your internet connection."
- ✅ "Cart update failed due to network error. [Retry]"
- ✅ "You appear to be offline. Your changes will be saved when connection is restored."

Bad error messages:
- ❌ "Error"
- ❌ "Network error"
- ❌ "500 Internal Server Error"
- ❌ No message at all

---

## Expected Results Summary

✅ **Clear Error Messages**: User-friendly messages explain network issues  
✅ **No Crashes**: System doesn't crash or freeze  
✅ **No Data Loss**: Changes not lost permanently  
✅ **Retry Option**: User can retry after reconnection  
✅ **Graceful Degradation**: System remains usable  
✅ **Status Indication**: User aware of online/offline status  
✅ **Automatic Recovery**: System recovers when connection restored  
✅ **Queue Handling**: Queued mutations handled correctly

---

## Actual Results

**Execution Date**: ___________  
**Executed By**: ___________  
**Browser**: ___________  
**Environment**: ___________

### Observations:
```
[To be filled during test execution]

Offline detection works: Yes/No
Error message shown: "___"
Error message quality: Good/Poor
Retry button available: Yes/No
Auto-retry implemented: Yes/No
Data loss observed: Yes/No
System crash: Yes/No
```

---

## Pass/Fail Criteria

**Pass**: 
- Clear, user-friendly error messages
- No system crashes or freezes
- No permanent data loss
- Retry mechanism available (manual or automatic)
- System recovers after reconnection
- User always aware of status

**Fail**: 
- No error messages or generic/technical errors
- System crashes on network failure
- Data lost permanently
- No retry mechanism
- System doesn't recover after reconnection
- User confused about what happened

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

- Network failures are common in real-world usage
- Mobile users especially experience intermittent connectivity
- Error handling is critical for user trust and satisfaction
- Consider implementing retry with exponential backoff
- Log all network errors for monitoring and debugging
- Test on actual mobile devices with real network conditions

---

## Network Simulation Methods

1. **Chrome DevTools**:
   - Network tab → Offline mode
   - Network throttling presets

2. **Browser Extensions**:
   - Offline Mode
   - Network Throttle

3. **System-Level**:
   - Disable Wi-Fi/Ethernet
   - Airplane mode (mobile)

4. **Proxy Tools**:
   - Charles Proxy
   - Fiddler
   - mitmproxy

---

## Screenshots/Evidence

[Attach screenshots or video recordings here]

1. Error message when offline
2. Retry button/mechanism
3. Network tab showing failed request
4. System after reconnection and retry
5. Offline indicator (if present)

