# TC-018: Concurrent Cart Updates from Multiple Devices

## Test Case Information

**Test Case ID**: TC-018  
**Test Case Title**: Verify Handling of Concurrent Cart Updates from Multiple Devices  
**Related Story**: [VCST-4003](https://virtocommerce.atlassian.net/browse/VCST-4003)  
**Priority**: Medium  
**Test Type**: Edge Case / Data Integrity  
**Estimated Time**: 20 minutes

---

## Description

Verify that the system correctly handles concurrent cart updates when the same user is logged in on multiple devices/browsers simultaneously and makes cart quantity changes on both. Ensure data integrity, proper conflict resolution, and no cart corruption.

---

## Preconditions

1. User account with login credentials
2. Access to 2+ browsers or devices simultaneously
3. User not logged in at test start
4. Ability to monitor Network tab on both browsers

---

## Test Data

- **Test User**: `test_user@example.com`
- **Devices**: Browser A (Chrome), Browser B (Firefox), optionally Mobile Device
- **Products**: 5+ products to test with

---

## Test Steps

### Step 1: Setup - Login on Multiple Devices
1. Open Browser A (e.g., Chrome)
2. Open Browser B (e.g., Firefox) or use private/incognito window
3. Log in with same user account on both
4. Navigate to category page on both
5. Verify cart is synced initially

**Expected Result**:
- Same cart visible on both devices
- Initial state is synchronized

---

### Step 2: Simultaneous Quantity Increase on Same Product
1. In Browser A: Increase Product X quantity from 1 to 3
2. In Browser B: **At the same time**, increase Product X quantity from 1 to 5
3. Wait for both mutations to complete
4. Refresh both browsers

**Expected Result**:
- System resolves conflict using one of these strategies:
  - **Last-Write-Wins**: Final quantity is 5 (Browser B's change)
  - **First-Write-Wins**: Final quantity is 3 (Browser A's change)
  - **Merge/Sum**: Final quantity considers both changes (implementation-specific)
- Both browsers show same final quantity after refresh
- No cart corruption

---

### Step 3: One Device Increases, Other Decreases Same Product
1. Product Y has quantity 10
2. In Browser A: Decrease to 5
3. In Browser B: Simultaneously increase to 15
4. Observe conflict resolution

**Expected Result**:
- Conflict resolved deterministically
- Last write typically wins
- No invalid state (e.g., negative quantity)
- Both devices eventually consistent

---

### Step 4: One Device Removes, Other Modifies Same Product
1. Product Z has quantity 3
2. In Browser A: Set quantity to 0 (remove)
3. In Browser B: Simultaneously increase to 5
4. Observe behavior

**Expected Result**:
- One action takes precedence
- Product either removed OR quantity is 5
- Consistent state across devices
- No partial/invalid state

---

### Step 5: Different Products Updated Simultaneously
1. In Browser A: Update Product A quantity
2. In Browser B: Simultaneously update Product B quantity
3. Both mutations sent

**Expected Result**:
- Both updates succeed (no conflict)
- Browser A's cart shows both changes after refresh
- Browser B's cart shows both changes after refresh
- Proper merging of independent changes

---

### Step 6: Rapid Sequential Updates on Different Devices
1. Browser A: Make 5 changes rapidly
2. Browser B: Make 5 different changes rapidly
3. All batched and sent

**Expected Result**:
- All changes eventually processed
- Conflicts resolved appropriately
- Final state is consistent
- No lost updates

---

### Step 7: Real-Time Synchronization Test (If Implemented)
1. Browser A: Make quantity change
2. Observe Browser B (without refresh)
3. Check if Browser B automatically updates

**Expected Result**:
- **If real-time sync implemented**:
  - Browser B shows update automatically (via WebSocket, polling, etc.)
  - User in Browser B sees change immediately
- **If no real-time sync**:
  - Browser B shows old value until refresh
  - After refresh, synchronized

---

### Step 8: Optimistic Update Conflict
1. Browser A: Make change (optimistic UI update, mutation pending)
2. Browser B: Make different change to same product (completes first)
3. Browser A's mutation completes after Browser B's

**Expected Result**:
- Server resolves based on arrival time or timestamp
- Browser A may show revert if server rejected change
- OR Browser A's change overwrites Browser B's
- Consistent final state

---

### Step 9: Network Delay Scenario
1. Browser A: Enable slow network throttling
2. Browser A: Make change (mutation delayed)
3. Browser B: Make change to same product (completes quickly)
4. Browser A's delayed mutation arrives later

**Expected Result**:
- Server handles out-of-order updates
- Timestamp or version-based conflict resolution
- Last-arriving mutation may win or be rejected
- Clear to user if their change was overwritten

---

### Step 10: Version Conflict Detection (If Implemented)
1. If system uses optimistic locking or version numbers
2. Browser A: Read cart (version 10)
3. Browser B: Update cart (version 10 → 11)
4. Browser A: Try to update (still thinks version is 10)

**Expected Result**:
- Browser A's update rejected (version conflict)
- User notified to refresh and retry
- Prevents lost updates
- Data integrity maintained

---

### Step 11: Different Product Types
1. Test with various product types:
   - Simple products
   - Products with variants (if applicable)
   - Bundle products (if applicable)
2. Make concurrent updates on different devices

**Expected Result**:
- All product types handle concurrency correctly
- No special cases break
- Consistent behavior

---

### Step 12: Mobile + Desktop Concurrent Updates
1. Use actual mobile device + desktop browser
2. Make concurrent cart updates
3. Test real-world scenario

**Expected Result**:
- Same conflict resolution applies
- Mobile updates handled equally
- No platform-specific issues

---

### Step 13: Cart Merge After One Device Offline
1. Browser A: Go offline, make changes (queued locally)
2. Browser B: Make changes (save to server)
3. Browser A: Reconnect and sync

**Expected Result**:
- Browser A's queued changes attempt to sync
- Server resolves conflicts
- User notified if changes overwritten
- No data loss if possible

---

### Step 14: Session Conflict
1. Browser A: Active session
2. Browser B: Login (new session, possibly invalidates Browser A)
3. Browser A: Try to update cart

**Expected Result**:
- Depends on session strategy:
  - If single session: Browser A logged out
  - If multiple sessions: Both can update
- Clear error messages
- No security issues

---

## Conflict Resolution Strategies

Systems typically use one of these:

1. **Last-Write-Wins (LWW)**:
   - Latest update overwrites previous
   - Simple but may lose updates
   - Timestamp-based

2. **First-Write-Wins**:
   - First update accepted
   - Later updates rejected
   - Rare in cart systems

3. **Optimistic Locking**:
   - Version numbers tracked
   - Update rejected if version mismatch
   - User must refresh and retry

4. **Operational Transformation**:
   - Complex merging of operations
   - Preserves intent of all users
   - Advanced implementation

5. **Manual Conflict Resolution**:
   - User prompted to choose
   - "Your cart was updated elsewhere. Accept changes?"

---

## Expected Results Summary

✅ **No Data Corruption**: Cart remains valid and consistent  
✅ **Deterministic Resolution**: Conflicts resolved predictably  
✅ **Eventually Consistent**: All devices show same state after sync  
✅ **No Lost Updates**: Changes tracked and applied or user notified  
✅ **Clear Communication**: User aware if their change was overwritten  
✅ **Performance**: Concurrent updates don't cause slowdown  
✅ **Real-Time Sync**: If implemented, works correctly  
✅ **Version Control**: If implemented, prevents lost updates

---

## Actual Results

**Execution Date**: ___________  
**Executed By**: ___________  
**Browsers/Devices**: ___________  
**Environment**: ___________

### Observations:
```
[To be filled during test execution]

Conflict resolution strategy: ___
Real-time sync implemented: Yes/No
Version control used: Yes/No

Test Scenario Results:
- Same product, both increase: Final quantity ___
- One increase, one decrease: Final quantity ___
- One remove, one modify: Product removed or quantity ___
- Different products: Both changes saved: Yes/No

Data corruption observed: Yes/No
Lost updates: Yes/No
User notification on conflict: Yes/No
```

---

## Pass/Fail Criteria

**Pass**: 
- No cart data corruption
- Conflicts resolved deterministically
- All devices eventually consistent
- No complete loss of updates without notification
- Clear user communication
- System remains stable
- Performance acceptable

**Fail**: 
- Cart corrupted (negative quantities, missing items)
- Non-deterministic behavior (different results each time)
- Devices perpetually out of sync
- Updates silently lost
- System crashes or errors
- Severe performance degradation

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

- This is critical for data integrity
- Common in real-world usage (users with multiple devices)
- Test with actual time differences (not just simulated)
- Document conflict resolution strategy for development team
- Consider implementing version control for better conflict handling
- Monitor for edge cases that could lead to data loss

---

## Testing Tips

- Use two different browsers to avoid session conflicts
- Use Network tab to verify timing of mutations
- Take screenshots of both browsers at each step
- Document exact timing of actions
- Test with various network speeds on different devices
- Consider using multiple physical devices for more realistic test

---

## Screenshots/Evidence

[Attach screenshots or video recordings here]

1. Both browsers logged in with same cart
2. Side-by-side concurrent updates
3. Network tab showing mutation timing
4. Final cart state on both devices (after refresh)
5. Any conflict messages shown to user

