# TC-011: UI Loading States and Visual Feedback

## Test Case Information

**Test Case ID**: TC-011  
**Test Case Title**: Verify UI Loading States and Visual Feedback  
**Related Story**: [VCST-4003](https://virtocommerce.atlassian.net/browse/VCST-4003)  
**Priority**: Medium  
**Test Type**: UI/UX  
**Estimated Time**: 10 minutes

---

## Description

Verify that appropriate loading indicators, visual feedback, and UI states are shown during cart update operations. While the feature emphasizes optimistic updates (immediate feedback), there should still be clear indicators when mutations are in-flight, especially on slow connections.

---

## Preconditions

1. User is logged into the VirtoCommerce platform
2. User is on a category page with products
3. Products are in cart
4. Browser DevTools available for network throttling

---

## Test Data

- **Test User**: `test_user@example.com`
- **Products**: At least 3 products in cart
- **Network**: Ability to throttle to simulate slow connection

---

## Test Steps

### Step 1: Observe Loading States on Fast Connection
1. Without network throttling
2. Increase product quantity
3. Observe any loading indicators

**Expected Result**:
- UI updates immediately (optimistic)
- Loading indicator may appear briefly (if at all)
- Smooth, fast experience
- No blocking UI elements

---

### Step 2: Enable Network Throttling - Slow Connection
1. Open DevTools → Network tab
2. Enable throttling: "Slow 3G"
3. Make a quantity change
4. Observe UI during pending mutation

**Expected Result**:
- UI updates immediately (optimistic)
- Loading indicator shown (spinner, skeleton, or subtle indicator)
- User can see that update is being saved
- Loading indicator disappears after mutation completes

---

### Step 3: Loading Indicator Types
1. Make quantity change on slow connection
2. Identify loading indicators present:
   - Spinner/loader icon
   - Progress bar
   - Skeleton loading
   - Disabled buttons
   - "Saving..." text
   - Pulsing/animated elements
3. Document what is shown

**Expected Result**:
- At least one type of loading indicator visible
- Indicator is subtle and non-intrusive
- Doesn't block or prevent other interactions (if possible)
- Professional, polished appearance

---

### Step 4: Button States During Update
1. Make quantity change (mutation pending)
2. Observe +/- buttons state
3. Try clicking buttons again during pending update

**Expected Result**:
- Buttons remain enabled (allowing queued changes)
- OR buttons show disabled state
- If disabled, clear visual indication (grayed out, cursor change)
- Behavior is consistent with queuing logic (TC-003)

---

### Step 5: Quantity Field States
1. Make quantity change via typing
2. Observe field state during mutation

**Expected Result**:
- Field may show:
  - Read-only state (with visual indicator)
  - OR remain editable (allowing queued changes)
  - Subtle loading indicator (e.g., spinner in field)
- Consistent with system behavior

---

### Step 6: Cart Icon Loading State
1. Make quantity change
2. Observe cart icon during mutation

**Expected Result**:
- Cart icon updates immediately (optimistic)
- May show subtle indicator of pending update:
  - Small spinner overlay
  - Pulsing animation
  - Badge color change
- Indicator clears after mutation completes

---

### Step 7: Success Feedback
1. Make quantity change
2. Wait for mutation to complete
3. Observe any success feedback

**Expected Result**:
- Success may be indicated by:
  - Green checkmark briefly shown
  - Success message/toast
  - Subtle animation
  - OR no explicit success (silent success)
- Non-intrusive and brief
- User confidence that save occurred

---

### Step 8: Error State Visual Feedback
1. Simulate error (disconnect network or cause validation error)
2. Make quantity change
3. Observe error feedback

**Expected Result**:
- Clear error indication:
  - Red color or error icon
  - Error message displayed
  - Retry button or action
- Optimistic update may revert on error
- User understands what went wrong

---

### Step 9: Multiple Pending Updates Indication
1. Enable slow network
2. Make multiple rapid changes (triggering queued mutations)
3. Observe if UI indicates multiple pending operations

**Expected Result**:
- Loading indicator persists while any updates pending
- May show count of pending updates (e.g., "Saving 2 items...")
- User aware that multiple updates are processing
- Or single generic "Saving..." indicator

---

### Step 10: Loading State During Queuing
1. Enable slow network
2. Make change (mutation 1 pending)
3. Make another change (queued)
4. Observe loading indicators

**Expected Result**:
- Loading indicator remains visible through queue
- Doesn't flicker on/off between mutations
- Smooth transition from one mutation to next
- User not confused by state changes

---

### Step 11: Accessibility - Screen Reader Announcements
1. Enable screen reader (NVDA, JAWS, or VoiceOver)
2. Make quantity change
3. Listen for announcements

**Expected Result**:
- Screen reader announces:
  - Quantity change
  - Loading/saving state
  - Success or error
- Live region updates work correctly
- Accessible to users with disabilities

---

### Step 12: Focus Management
1. Make quantity change via keyboard
2. Observe focus during loading

**Expected Result**:
- Focus remains stable (doesn't jump unexpectedly)
- After update, focus returns to logical location
- Keyboard users not disoriented

---

### Step 13: Visual Consistency
1. Test loading states on various products
2. Verify consistency

**Expected Result**:
- All products show same loading indicators
- Consistent placement and styling
- Professional, polished appearance
- Follows design system guidelines

---

### Step 14: Performance - No Layout Shift
1. Make quantity change
2. Observe page layout

**Expected Result**:
- No Cumulative Layout Shift (CLS)
- Loading indicators don't push content around
- Smooth, stable visual experience
- Page doesn't "jump" or reflow

---

## Expected Results Summary

✅ **Immediate Feedback**: Optimistic updates provide instant feedback  
✅ **Loading Indicators**: Clear indication of pending mutations  
✅ **Subtle & Non-Intrusive**: Indicators don't block or distract  
✅ **Success Feedback**: User knows when save is complete  
✅ **Error Feedback**: Clear error messages when issues occur  
✅ **Accessibility**: Screen reader support for state changes  
✅ **Consistent**: Same behavior across all products  
✅ **Professional**: Polished, high-quality visual design

---

## Actual Results

**Execution Date**: ___________  
**Executed By**: ___________  
**Browser**: ___________  
**Environment**: ___________

### Observations:
```
[To be filled during test execution]

Loading indicator types observed:
  - Spinner: Yes/No
  - Text: Yes/No
  - Button state: Yes/No
  - Icon animation: Yes/No

Success feedback shown: Yes/No
Error feedback clear: Yes/No
Screen reader support: Yes/No
Layout shift observed: Yes/No
```

---

## Pass/Fail Criteria

**Pass**: 
- Clear loading indicators during pending mutations
- Indicators are subtle and non-intrusive
- Success and error states communicated clearly
- Screen reader accessible
- No layout shift
- Consistent across all products
- Professional appearance

**Fail**: 
- No loading indicators (user unsure if update saving)
- Indicators block or interfere with user
- No error feedback when issues occur
- Not accessible to screen readers
- Layout shifts during updates
- Inconsistent or unprofessional appearance

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

- Loading states should be subtle since feature emphasizes speed
- Balance between providing feedback and not cluttering UI
- Test with actual slow connection, not just throttling
- Verify design consistency with rest of site
- Consider cultural differences in success/error colors
- Test with motion preferences (prefers-reduced-motion)

---

## Design Checklist

- [ ] Loading spinner/indicator present
- [ ] Success feedback (if any) is brief
- [ ] Error states clearly communicated
- [ ] Button states visually distinct
- [ ] Cart icon shows update status
- [ ] No layout shift during loading
- [ ] Accessible to screen readers
- [ ] Follows design system

---

## Screenshots/Evidence

[Attach screenshots or video recordings here]

1. Loading indicator during pending mutation
2. Button states (enabled/disabled)
3. Cart icon with update indicator
4. Success feedback (if shown)
5. Error state visual feedback
6. Screen reader output (text transcript)

