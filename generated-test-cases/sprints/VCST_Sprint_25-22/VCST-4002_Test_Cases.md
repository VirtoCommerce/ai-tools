# Test Cases for VCST-4002: [Sign-in] Accessibility checker

## User Story Details
[As provided in the prompt...]

---

## Test Cases

### Test Case 1: Verify Alt Text Removal for Entra ID Sign-in Button
**Objective**: Verify that redundant alt text is removed from the Entra ID sign-in button while maintaining accessibility

**Preconditions**:
- Sign-in page is accessible
- Screen reader software is installed and running
- User has access to the sign-in page

**Test Steps**:
1. Navigate to the sign-in page
2. Inspect the Entra ID sign-in button element
3. Verify the image alt attribute is set to alt=""
4. Use screen reader to navigate to the Entra ID sign-in button
5. Listen to screen reader output

**Expected Results**:
- Image element has empty alt attribute (alt="")
- Button text "Sign in with Entra ID" is read only once by screen reader
- Button remains functional and accessible
- No duplicate text announcement by screen reader

**Test Data**: N/A

**Priority**: High

---

### Test Case 2: Verify Alt Text Removal for Google Sign-in Button
**Objective**: Verify that redundant alt text is removed from the Google sign-in button while maintaining accessibility

**Preconditions**:
- Sign-in page is accessible
- Screen reader software is installed and running

**Test Steps**:
1. Navigate to the sign-in page
2. Inspect the Google sign-in button element
3. Verify the image alt attribute is set to alt=""
4. Use screen reader to navigate to the Google sign-in button
5. Listen to screen reader output

**Expected Results**:
- Image element has empty alt attribute (alt="")
- Button text "Sign in with Google" is read only once by screen reader
- Button remains functional and accessible
- No duplicate text announcement by screen reader

**Priority**: High

---

### Test Case 3: Verify Keyboard Navigation Accessibility
**Objective**: Ensure that removing alt text doesn't affect keyboard navigation accessibility

**Preconditions**:
- Sign-in page is accessible
- Keyboard navigation is enabled

**Test Steps**:
1. Navigate to the sign-in page
2. Use Tab key to navigate through sign-in options
3. Verify focus indicator on Entra ID button
4. Verify focus indicator on Google button
5. Attempt to activate buttons using Enter key

**Expected Results**:
- Clear focus indication on both buttons
- Buttons are accessible via keyboard navigation
- Buttons activate correctly with Enter key
- Tab order is logical and sequential

**Priority**: Medium

---

### Test Case 4: Screen Reader Compatibility Across Browsers
**Objective**: Verify screen reader compatibility across different browsers

**Preconditions**:
- Multiple browsers installed (Chrome, Firefox, Safari)
- Screen reader software compatible with each browser

**Test Steps**:
1. Test screen reader output in Chrome
2. Test screen reader output in Firefox
3. Test screen reader output in Safari
4. Compare announcements across browsers

**Expected Results**:
- Consistent screen reader behavior across browsers
- No duplicate text announcements
- Proper button role announcement
- Consistent navigation experience

**Priority**: Medium

---

### Test Case 5: High Contrast Mode Compatibility
**Objective**: Verify accessibility in high contrast mode

**Preconditions**:
- High contrast mode enabled in system settings

**Test Steps**:
1. Enable high contrast mode
2. Navigate to sign-in page
3. Verify button visibility and contrast
4. Verify text readability
5. Test screen reader functionality

**Expected Results**:
- Buttons remain visible and distinguishable
- Text is clearly readable
- Screen reader functions correctly
- No loss of functionality or accessibility

**Priority**: Medium

---

### Test Case 6: Mobile Screen Reader Compatibility
**Objective**: Verify accessibility on mobile devices with screen readers

**Preconditions**:
- Mobile device with VoiceOver (iOS) or TalkBack (Android)
- Access to sign-in page

**Test Steps**:
1. Open sign-in page on mobile device
2. Enable mobile screen reader
3. Navigate through sign-in options
4. Attempt to activate buttons

**Expected Results**:
- Proper screen reader announcements
- No duplicate text reading
- Buttons are easy to locate and activate
- Consistent experience with desktop version

**Priority**: Medium

---

## Edge Cases and Negative Tests

### Test Case 7: Dynamic Content Loading
**Objective**: Verify accessibility when content loads dynamically

**Preconditions**:
- Slow network connection simulated
- Screen reader active

**Test Steps**:
1. Load sign-in page with throttled connection
2. Monitor screen reader announcements during loading
3. Verify button accessibility after full load
4. Test interaction during loading state

**Expected Results**:
- No erroneous announcements during loading
- Proper accessibility after content loads
- No duplicate announcements after dynamic updates
- Graceful handling of loading states

**Priority**: Low

---

## Notes
- All tests should be performed with popular screen readers (NVDA, JAWS, VoiceOver)
- Consider testing with different screen reader versions
- Document any browser-specific behaviors
- Verify compliance with WCAG 2.1 guidelines
- Consider testing with different language settings