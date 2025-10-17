# TC-002: Debounce Batching (1-Second Delay)

## Test Case Information

**Test Case ID**: TC-002  
**Test Case Title**: Verify 1-Second Debounce Delay for Batching Cart Updates  
**Related Story**: [VCST-4003](https://virtocommerce.atlassian.net/browse/VCST-4003)  
**Priority**: High  
**Test Type**: Functional  
**Estimated Time**: 15 minutes

---

## Description

Verify that cart quantity updates are batched using a 1-second debounce delay. Multiple rapid quantity changes should be combined into a single GraphQL mutation that is sent 1 second after the last user action.

---

## Preconditions

1. User is logged into the VirtoCommerce platform
2. User has navigated to a category page with products
3. Multiple products are available to add to cart
4. Browser DevTools Network tab is open and filtered for GraphQL requests

---

## Test Data

- **Test User**: `test_user@example.com`
- **Category**: Any category with at least 3-5 products
- **Products**: At least 3 different products

---

## Test Steps

### Step 1: Setup and Observation
1. Open Browser DevTools (F12)
2. Navigate to Network tab
3. Filter by "graphql" or "updateCart"
4. Clear network log
5. Navigate to a category page

**Expected Result**: Network tab is ready to capture GraphQL mutations

---

### Step 2: Single Quantity Change
1. Add a product to cart or increase quantity of existing product
2. Wait and observe the Network tab
3. Note the time between the UI change and the network request

**Expected Result**:
- UI updates immediately
- GraphQL mutation sent after ~1 second delay
- Delay is approximately 1000ms (±50ms tolerance)

---

### Step 3: Multiple Rapid Changes on Same Product
1. Clear network log
2. Click the "+" button on a single product 5 times rapidly (within 1 second)
3. Stop clicking and observe the Network tab
4. Count the number of GraphQL mutations sent

**Expected Result**:
- Only 1 GraphQL mutation is sent (not 5 separate mutations)
- Mutation is sent ~1 second after the last click
- Mutation includes the final quantity value
- UI shows all 5 increments immediately

---

### Step 4: Multiple Changes on Different Products
1. Clear network log
2. Within 1 second:
   - Increase quantity of Product A by 2 (click + twice)
   - Increase quantity of Product B by 3 (click + three times)
   - Decrease quantity of Product C by 1 (click - once)
3. Stop all actions and observe the Network tab
4. Inspect the mutation payload

**Expected Result**:
- Only 1 GraphQL mutation is sent
- Mutation includes all product changes in a single batch
- Payload format: `{ items: [{ productId: "A", quantity: 2 }, { productId: "B", quantity: 3 }, { productId: "C", quantity: -1 }] }`
- Mutation sent ~1 second after the last action

---

### Step 5: Verify Debounce Reset
1. Clear network log
2. Increase product quantity by 1 (click +)
3. Wait 500ms (half of debounce delay)
4. Increase same product quantity again (click +)
5. Wait and observe when the mutation is sent

**Expected Result**:
- Debounce timer resets after the second click
- Mutation is sent ~1 second after the SECOND click (not the first)
- Total wait time is ~1.5 seconds from first click
- Only 1 mutation is sent with final quantity

---

### Step 6: Verify Debounce Completion
1. Clear network log
2. Increase product quantity by 1 (click +)
3. Wait exactly 1 second
4. Verify mutation is sent
5. Immediately increase quantity again (click + after mutation sent)
6. Observe if a new mutation is triggered

**Expected Result**:
- First mutation sent after 1 second
- Second action triggers a new debounce cycle
- Second mutation sent ~1 second after the new action
- Two separate mutations in total (not batched because first already completed)

---

### Step 7: Inspect Mutation Payload Structure
1. Execute a batch update (multiple products, multiple changes)
2. Wait for mutation to be sent
3. Inspect the request payload in Network tab

**Expected Result**:
- Mutation name: `updateCartQuantity` (or similar)
- Payload includes:
  - `cartId`: String
  - `items`: Array of objects with `{ productId, quantity }`
- All changes included in single items array
- Payload is well-formed JSON

---

### Step 8: Measure Debounce Accuracy
1. Use DevTools Performance/Timeline recording
2. Perform a quantity change
3. Mark the exact time of user action and network request
4. Calculate the delay

**Expected Result**:
- Delay is 1000ms ±50ms
- Consistent across multiple attempts
- No significant drift or variance

---

## Expected Results Summary

✅ **1-Second Delay**: Mutations sent ~1000ms after last user action  
✅ **Batching Works**: Multiple changes combined into single mutation  
✅ **Debounce Resets**: Timer resets with each new action within delay period  
✅ **Single Mutation**: Only one network request for rapid changes  
✅ **Correct Payload**: All changes included in items array  
✅ **Timing Accuracy**: Delay is consistent (±50ms tolerance)

---

## Actual Results

**Execution Date**: ___________  
**Executed By**: ___________  
**Browser**: ___________  
**Environment**: ___________

### Observations:
```
[To be filled during test execution]

Number of mutations for 5 rapid clicks: ___
Measured debounce delay: ___ ms
Payload structure verified: Yes/No
```

---

## Pass/Fail Criteria

**Pass**: 
- Debounce delay is 1000ms ±50ms
- Multiple rapid changes result in single mutation
- All changes correctly batched in items array
- Debounce timer resets appropriately

**Fail**: 
- Delay significantly differs from 1000ms (>±50ms)
- Multiple mutations sent for rapid changes
- Changes not properly batched
- Debounce doesn't reset or works inconsistently

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

- Configurable delay mentioned in requirements - verify configuration option
- Test with different debounce values if configurable (e.g., 500ms, 2000ms)
- Verify no memory leaks with repeated debounce cycles
- Check console for any timing-related warnings

---

## Screenshots/Evidence

[Attach screenshots or video recordings here]

1. Network tab showing single mutation for multiple clicks
2. Timeline/Performance recording showing 1-second delay
3. Request payload showing batched items array
4. DevTools timestamp showing exact timing

