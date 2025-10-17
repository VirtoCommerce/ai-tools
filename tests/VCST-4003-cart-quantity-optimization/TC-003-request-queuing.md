# TC-003: Request Queuing During In-Flight Requests

## Test Case Information

**Test Case ID**: TC-003  
**Test Case Title**: Validate Request Queuing When Mutation is In-Flight  
**Related Story**: [VCST-4003](https://virtocommerce.atlassian.net/browse/VCST-4003)  
**Priority**: High  
**Test Type**: Functional  
**Estimated Time**: 15 minutes

---

## Description

Verify that when a GraphQL cart update mutation is in-flight (pending), new quantity changes are queued and sent only after the previous mutation completes, plus the debounce delay. This prevents overlapping mutations and ensures data consistency.

---

## Preconditions

1. User is logged into the VirtoCommerce platform
2. User has navigated to a category page with products
3. Browser DevTools Network tab is open
4. Network throttling capability available (to simulate slow responses)

---

## Test Data

- **Test User**: `test_user@example.com`
- **Category**: Any category with at least 3 products
- **Network Throttle**: Slow 3G (to extend mutation response time)

---

## Test Steps

### Step 1: Setup Network Throttling
1. Open Browser DevTools (F12)
2. Navigate to Network tab
3. Enable network throttling: "Slow 3G"
4. Clear network log
5. Navigate to category page

**Expected Result**: Network throttling active, slow server responses

---

### Step 2: Initiate First Mutation
1. Increase quantity of Product A (click +)
2. Wait 1 second for debounce to complete
3. Observe the mutation request sent (but not completed due to slow network)
4. Note the request is "Pending" in Network tab

**Expected Result**:
- First mutation sent after 1-second debounce
- Request shows as "Pending" in Network tab
- UI shows updated quantity optimistically

---

### Step 3: Make Changes While First Request is Pending
1. **Before the first mutation completes**:
   - Increase quantity of Product B (click +)
   - Increase quantity of Product C (click +)
   - Wait 1 second
2. Observe if a second mutation is sent

**Expected Result**:
- Second mutation is NOT sent immediately after 1 second
- Changes are queued
- UI updates optimistically for Products B and C
- Network tab shows only 1 pending request (first mutation)

---

### Step 4: Verify Queue Release After First Completion
1. Wait for the first mutation to complete (check Network tab)
2. After first mutation completes, wait another ~1 second
3. Observe if the queued changes are sent

**Expected Result**:
- First mutation completes successfully
- After ~1 second delay (debounce), second mutation is sent
- Second mutation includes all queued changes (Products B and C)
- Network tab now shows 2 requests total (first completed, second pending)

---

### Step 5: Test Multiple Queue Cycles
1. While second mutation is pending:
   - Decrease quantity of Product A (click -)
   - Increase quantity of Product D (click +)
2. Wait for second mutation to complete
3. Verify a third mutation is sent after debounce

**Expected Result**:
- Third mutation waits for second to complete
- Third mutation sent after second completes + 1-second debounce
- All mutations processed sequentially
- No overlapping mutations

---

### Step 6: Verify Queue Consolidation
1. Ensure no mutations are pending
2. Increase Product A quantity (click +)
3. Wait 1 second (mutation sent, pending)
4. **While mutation is pending**:
   - Increase Product A again (click +)
   - Increase Product A again (click +)
5. Wait for first mutation to complete
6. Observe the queued mutation payload

**Expected Result**:
- Queued changes are consolidated
- Second mutation reflects all queued changes to Product A
- Not multiple separate mutations for Product A
- Final quantity is correct

---

### Step 7: Test Queue with Rapid Changes
1. Clear network log
2. Re-enable network throttling (Slow 3G)
3. Make 10 rapid quantity changes across multiple products (within 2 seconds)
4. Observe mutation behavior

**Expected Result**:
- First batch sent after 1-second debounce (still pending)
- Remaining changes queued
- After first completes, second mutation sent with all queued changes
- Maximum 2-3 mutations total (not 10)

---

### Step 8: Disable Throttling and Test Normal Flow
1. Disable network throttling
2. Clear network log
3. Make rapid changes (5+ actions within 1 second)
4. Observe mutation behavior on fast network

**Expected Result**:
- Even on fast network, queuing logic prevents overlaps
- Mutations complete quickly, but queue still manages order
- No race conditions or conflicts

---

### Step 9: Verify UI Consistency Throughout Queue
1. Enable slow network again
2. Make changes to 3 products while mutations are queued
3. Observe UI state during:
   - First mutation pending
   - Second mutation queued
   - After all mutations complete

**Expected Result**:
- UI always shows latest optimistic state
- No flickering or reverting
- Final UI state matches server state after all mutations complete

---

## Expected Results Summary

✅ **Queue Activation**: New changes queued when mutation is in-flight  
✅ **Sequential Processing**: Mutations processed one at a time, no overlaps  
✅ **Queue Release**: Queued mutation sent after previous completes + debounce  
✅ **Consolidation**: Multiple changes to same product consolidated in queue  
✅ **UI Consistency**: UI remains consistent throughout queuing process  
✅ **No Race Conditions**: Order of operations preserved

---

## Actual Results

**Execution Date**: ___________  
**Executed By**: ___________  
**Browser**: ___________  
**Environment**: ___________

### Observations:
```
[To be filled during test execution]

Number of mutations with 10 rapid changes: ___
Queue behavior verified: Yes/No
Timing between mutations: ___ ms
```

---

## Pass/Fail Criteria

**Pass**: 
- Changes are queued when mutation is in-flight
- No overlapping mutations occur
- Queued mutation sent after previous completes + 1s debounce
- UI remains consistent throughout
- All changes eventually processed correctly

**Fail**: 
- Mutations overlap (multiple in-flight simultaneously)
- Queued changes lost or not processed
- Race conditions or data conflicts
- UI shows inconsistent state

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

- This is a critical test for data consistency
- Use slow network throttling to clearly observe queuing behavior
- Verify no console errors related to concurrent mutations
- Check server logs for any conflicts or race conditions
- Test with various network speeds (Fast 3G, Slow 3G, Offline/Online)

---

## Screenshots/Evidence

[Attach screenshots or video recordings here]

1. Network tab showing first mutation pending
2. Network tab showing queued second mutation after first completes
3. Timeline showing sequential mutation processing
4. UI state during queuing process

