# TC-010: Multiple Rapid Quantity Changes

## Test Case Information

**Test Case ID**: TC-010  
**Test Case Title**: Verify Handling of Multiple Rapid Quantity Changes  
**Related Story**: [VCST-4003](https://virtocommerce.atlassian.net/browse/VCST-4003)  
**Priority**: High  
**Test Type**: Functional / UX  
**Estimated Time**: 15 minutes

---

## Description

Verify that the system correctly handles multiple rapid quantity changes by the user, including clicking +/- buttons rapidly, typing quickly, and making changes to multiple products in quick succession. Ensure UI remains responsive, changes are batched correctly, and final state is accurate.

---

## Preconditions

1. User is logged into the VirtoCommerce platform
2. User is on a category page with multiple products
3. At least 3-5 products are available (some in cart, some not)
4. Browser DevTools Network tab is open for observation

---

## Test Data

- **Test User**: `test_user@example.com`
- **Products**: 5+ products in various categories
- **Initial Quantities**: Mix of 0, 1, 3, 5

---

## Test Steps

### Step 1: Rapid Increase Clicks on Single Product
1. Locate a product with quantity = 1
2. Click the "+" button 10 times rapidly (as fast as possible)
3. Observe UI updates
4. Wait for mutation to complete

**Expected Result**:
- UI updates with each click (1 → 2 → 3 → ... → 11)
- UI remains responsive, no lag or freezing
- All clicks registered
- Single batched mutation sent with final quantity (11)
- No mutations lost

---

### Step 2: Rapid Decrease Clicks on Single Product
1. Locate a product with quantity = 10
2. Click the "-" button 8 times rapidly
3. Observe UI behavior

**Expected Result**:
- Quantity decreases with each click (10 → 9 → 8 → ... → 2)
- UI updates smoothly
- Final quantity is correct (2)
- Single mutation sent after debounce

---

### Step 3: Rapid Alternating Increase/Decrease
1. Starting with quantity = 5
2. Rapidly alternate:
   - Click + (5 → 6)
   - Click - (6 → 5)
   - Click + (5 → 6)
   - Click + (6 → 7)
   - Click - (7 → 6)
3. Observe final state

**Expected Result**:
- UI tracks all changes in real-time
- Final quantity is correct (6)
- Mutation includes final consolidated value
- No confusion or incorrect state

---

### Step 4: Rapid Changes Across Multiple Products
1. Within 2 seconds, perform actions on 5 different products:
   - Product A: click + 3 times
   - Product B: click - 2 times
   - Product C: type "7" in field
   - Product D: click + once
   - Product E: set to 0 (remove)
2. Wait for batched mutation

**Expected Result**:
- All UI updates happen immediately
- Single mutation sent with all 5 products
- Mutation payload includes all changes:
  ```json
  {
    "items": [
      { "productId": "A", "quantity": 4 },  // was 1, +3
      { "productId": "B", "quantity": 1 },  // was 3, -2
      { "productId": "C", "quantity": 7 },
      { "productId": "D", "quantity": 2 },  // was 1, +1
      { "productId": "E", "quantity": 0 }   // removed
    ]
  }
  ```
- All changes persisted correctly

---

### Step 5: Rapid Type and Delete
1. Click into quantity field
2. Rapidly type: "2" "5" (to make 25)
3. Quickly backspace twice
4. Type "3"
5. Press Enter

**Expected Result**:
- Field shows "3" as final value
- Mutation sent with quantity: 3
- No intermediate mutations for "2", "25", etc.
- Debounce waits for user to finish typing

---

### Step 6: Spam Clicking + Button
1. Product starts with quantity = 1
2. Click + button 50 times as fast as possible
3. Observe system behavior

**Expected Result**:
- UI updates for all 50 clicks (or catches up smoothly)
- No UI freezing or browser hang
- Final quantity is 51
- System remains responsive
- No console errors
- Single or minimal mutations sent (not 50 separate mutations)

---

### Step 7: Changes During Debounce Window
1. Increase product quantity by 1
2. Wait 500ms (half of 1s debounce)
3. Increase same product again
4. Wait 500ms
5. Increase again
6. Observe timing

**Expected Result**:
- Debounce timer resets with each action
- Total wait is ~1.5 seconds from first action
- Only one mutation sent with final consolidated value
- All changes captured

---

### Step 8: Rapid Changes Then Navigation
1. Make 10 rapid changes across multiple products
2. Immediately try to navigate away (before mutation sent)
3. Observe warning (if within debounce window)

**Expected Result**:
- If within debounce: Warning shown
- If mutation already sent but pending: Warning shown
- User protected from losing unsaved changes

---

### Step 9: Keyboard Shortcuts (If Available)
1. Focus on quantity field
2. Use keyboard arrows to adjust:
   - Press Up arrow rapidly 5 times
   - Press Down arrow rapidly 3 times
3. Observe behavior

**Expected Result**:
- If supported: Quantity changes with keyboard
- Same debounce/batching behavior applies
- Final state is correct

---

### Step 10: Mobile/Touch Rapid Taps (If Applicable)
1. (On mobile or tablet, or using browser device emulation)
2. Rapidly tap + button multiple times
3. Observe touch responsiveness

**Expected Result**:
- Touch events handled smoothly
- No double-tap issues
- All taps registered
- No accidental zoom or other gestures

---

### Step 11: Stress Test - Extreme Rapid Changes
1. Have 10 products on page
2. Make rapid changes to all 10 within 3 seconds
3. Mix of increases, decreases, removals, typing
4. Observe system stability

**Expected Result**:
- System remains stable
- No crashes or errors
- All changes eventually processed
- UI may have slight delay catching up, but recovers
- No data loss

---

### Step 12: Verify Final State Accuracy
1. After any rapid change test
2. Wait for all mutations to complete
3. Refresh the page
4. Verify all quantities match expected values

**Expected Result**:
- After refresh, quantities are correct
- All changes persisted
- No missing or incorrect updates
- Database state matches UI state

---

## Expected Results Summary

✅ **UI Responsiveness**: UI remains responsive during rapid changes  
✅ **All Changes Captured**: No clicks or inputs lost  
✅ **Correct Final State**: Final quantities accurate after rapid changes  
✅ **Efficient Batching**: Rapid changes consolidated into minimal mutations  
✅ **Debounce Works**: Debounce timer resets appropriately  
✅ **No Crashes**: System stable even under extreme rapid inputs  
✅ **Multi-Product Support**: Can handle rapid changes across many products  
✅ **Persistence**: All changes saved correctly

---

## Actual Results

**Execution Date**: ___________  
**Executed By**: ___________  
**Browser**: ___________  
**Environment**: ___________

### Observations:
```
[To be filled during test execution]

50 rapid clicks - final quantity: ___
UI lag observed: Yes/No
Console errors: Yes/No
All changes persisted: Yes/No
Number of mutations for 10 products: ___
```

---

## Pass/Fail Criteria

**Pass**: 
- UI responsive during all rapid change scenarios
- All user inputs captured and processed
- Final quantities are accurate
- Efficient batching (minimal mutations)
- No system crashes or errors
- Changes persist after refresh
- Debounce and queuing work correctly

**Fail**: 
- UI freezes or becomes unresponsive
- Clicks or inputs lost
- Incorrect final quantities
- Excessive mutations sent (not batched)
- System crashes or console errors
- Data loss after refresh
- Debounce/queuing broken

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

- This is a critical stress test for the feature
- Tests the robustness of debounce and batching logic
- May reveal race conditions or state management issues
- Pay attention to browser console for errors
- Monitor memory usage during extreme tests
- Compare performance with old implementation

---

## Performance Benchmarks

| Scenario | Max Acceptable Response | Target |
|----------|-------------------------|---------|
| 10 rapid clicks | UI updates within 500ms | <100ms per update |
| 50 rapid clicks | System remains responsive | No freezing |
| 5 products changed | Single mutation sent | 1 mutation |
| UI catch-up time | <2s after rapid changes | <500ms |

---

## Screenshots/Evidence

[Attach screenshots or video recordings here]

1. Video of rapid clicking (showing UI responsiveness)
2. Network tab showing batched mutation
3. Console showing no errors
4. Final quantities after refresh (verification)
5. Performance timeline during stress test

