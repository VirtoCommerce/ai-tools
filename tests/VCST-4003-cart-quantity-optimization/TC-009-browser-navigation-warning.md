# TC-009: Browser Navigation Warning During Pending Updates

## Test Case Information

**Test Case ID**: TC-009  
**Test Case Title**: Verify Browser Navigation Warning When Cart Update is Pending  
**Related Story**: [VCST-4003](https://virtocommerce.atlassian.net/browse/VCST-4003)  
**Priority**: High  
**Test Type**: Functional / UX  
**Estimated Time**: 15 minutes

---

## Description

Verify that when a cart update is in progress (mutation pending), the user receives a warning message when attempting to navigate away from the page, close the tab, or close the browser. This prevents accidental loss of cart updates.

**Requirement**: Per VCST-4003, "If an update is still in progress, the customer is shown a warning when trying to: Close the tab/window, Navigate away from the page. Message: 'Cart update is in progress. Do you want to leave without saving changes?'"

---

## Preconditions

1. User is logged into the VirtoCommerce platform
2. User is on a category page with products
3. Products are in the cart
4. Network can be throttled to extend mutation time
5. Browser supports `beforeunload` event

---

## Test Data

- **Test User**: `test_user@example.com`
- **Products**: At least 2 products in cart
- **Network**: Throttled to Slow 3G

---

## Test Steps

### Step 1: Enable Network Throttling
1. Open Browser DevTools (F12)
2. Go to Network tab
3. Enable throttling: "Slow 3G"
4. Navigate to category page

**Expected Result**: Network throttling active, mutations will take longer to complete

---

### Step 2: Trigger Cart Update and Attempt Navigation
1. Increase product quantity (click +)
2. Wait 1 second for mutation to be sent (still pending)
3. While mutation is pending:
   - Click browser back button OR
   - Try to navigate to another page

**Expected Result**:
- Browser shows warning dialog
- Message: **"Cart update is in progress. Do you want to leave without saving changes?"** (or similar)
- User can choose: "Leave" or "Stay"

---

### Step 3: Choose to Stay on Page
1. Trigger cart update (mutation pending)
2. Attempt to navigate away
3. In warning dialog, click "Cancel" or "Stay" button

**Expected Result**:
- User remains on category page
- Mutation continues and completes
- Cart update is saved
- No data loss

---

### Step 4: Choose to Leave Page
1. Trigger cart update (mutation pending)
2. Attempt to navigate away
3. In warning dialog, click "Leave" or "OK" button

**Expected Result**:
- User navigates away
- Cart update may or may not complete (depends on timing)
- Behavior is acceptable - user chose to leave

---

### Step 5: Attempt to Close Tab
1. Trigger cart update (mutation pending)
2. Attempt to close browser tab (Ctrl+W or click X)

**Expected Result**:
- Browser shows warning dialog
- Similar message about cart update in progress
- User can choose to stay or leave

---

### Step 6: Attempt to Close Browser Window
1. Trigger cart update (mutation pending)
2. Attempt to close entire browser window

**Expected Result**:
- Browser shows warning dialog
- User is warned about pending cart update
- Can choose to stay or close

---

### Step 7: Attempt to Refresh Page
1. Trigger cart update (mutation pending)
2. Press F5 or Ctrl+R to refresh

**Expected Result**:
- Browser shows warning dialog
- User warned about unsaved changes
- Can choose to stay or reload

---

### Step 8: Navigate Using Address Bar
1. Trigger cart update (mutation pending)
2. Click in address bar and type new URL
3. Press Enter

**Expected Result**:
- Browser shows warning before navigating
- User can cancel navigation

---

### Step 9: Verify No Warning After Update Completes
1. Trigger cart update
2. Wait for mutation to complete (check Network tab)
3. After completion, navigate away

**Expected Result**:
- NO warning shown
- Navigation proceeds normally
- User can leave page freely once update is done

---

### Step 10: Multiple Pending Updates
1. Enable network throttling
2. Make multiple cart changes (triggering multiple queued mutations)
3. Attempt to navigate while updates are queued

**Expected Result**:
- Warning shown if any updates are pending or queued
- User protected from losing multiple pending changes

---

### Step 11: Test on Fast Connection
1. Disable network throttling
2. Make cart update
3. **Immediately** try to navigate (within the 1s debounce window)

**Expected Result**:
- Warning may or may not show (depends on implementation)
- Ideally: Warning shows during debounce period too
- Consistent behavior across network speeds

---

### Step 12: Verify Warning Message Content
1. Trigger warning dialog
2. Read the message carefully
3. Verify clarity and actionability

**Expected Result**:
- Message is clear and understandable
- Explains what's happening: "Cart update is in progress"
- Asks user to confirm: "Do you want to leave without saving changes?"
- Buttons are clearly labeled: "Leave" / "Stay" (or "OK" / "Cancel")

---

### Step 13: Multiple Browser Windows
1. Open same site in two windows
2. In Window 1, trigger cart update (pending)
3. In Window 1, try to navigate away

**Expected Result**:
- Warning shown in Window 1
- Each window manages its own state
- No interference between windows

---

### Step 14: Test with Form Submission
1. If category page has any forms
2. Trigger cart update (pending)
3. Try to submit a form that would navigate away

**Expected Result**:
- Warning shown before form submission
- Cart update protection works consistently

---

## Expected Results Summary

✅ **Warning Shown**: Dialog appears when navigation attempted during pending update  
✅ **Correct Message**: Clear message about cart update in progress  
✅ **User Choice**: User can choose to stay or leave  
✅ **Stay Works**: Choosing to stay keeps user on page, update completes  
✅ **All Navigation Types**: Works for back button, close tab, close window, refresh, URL change  
✅ **No Warning After Completion**: Once update completes, no warning shown  
✅ **Consistent Behavior**: Works across all browsers and navigation methods

---

## Actual Results

**Execution Date**: ___________  
**Executed By**: ___________  
**Browser**: ___________  
**Environment**: ___________

### Observations:
```
[To be filled during test execution]

Warning message text: "___________"
Warning triggers tested:
  - Back button: Yes/No
  - Close tab: Yes/No
  - Close window: Yes/No
  - Refresh: Yes/No
  - URL change: Yes/No
  
Behavior consistent: Yes/No
```

---

## Pass/Fail Criteria

**Pass**: 
- Warning dialog shown during pending cart updates
- Message is clear and mentions cart update in progress
- User can choose to stay or leave
- Choosing to stay allows update to complete
- Warning works for all navigation types
- No warning shown after update completes
- No false positives (warning when no update pending)

**Fail**: 
- No warning shown during pending updates
- Message is unclear or generic
- User cannot cancel navigation
- Warning persists after update completes
- Inconsistent behavior across navigation types
- False warnings when no update pending

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

- This feature uses browser's `beforeunload` event
- Some browsers limit customization of the warning message
- Modern browsers may show generic message instead of custom text
- Test actual message shown vs. intended message
- Consider accessibility (screen reader users)
- Verify no memory leaks from event listeners

---

## Browser-Specific Notes

| Browser | Custom Message Support | Notes |
|---------|------------------------|-------|
| Chrome | Limited | Shows generic message |
| Firefox | Limited | Shows generic message |
| Safari | Limited | Shows generic message |
| Edge | Limited | Shows generic message |

Modern browsers may display their own generic warning message for security reasons, but the dialog should still appear.

---

## Screenshots/Evidence

[Attach screenshots or video recordings here]

1. Warning dialog when attempting to close tab
2. Warning dialog when attempting to navigate back
3. Warning dialog message text
4. Network tab showing pending mutation
5. Successful stay on page and completion of update

