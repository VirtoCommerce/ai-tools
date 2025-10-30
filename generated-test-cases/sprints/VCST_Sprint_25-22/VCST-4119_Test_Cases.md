# Test Cases for VCST-4119: Rename "Share" Button to "Send Test Message" in Email Notification UI

## User Story Details
- **Jira Key**: VCST-4119
- **Summary**: Rename "Share" Button to "Send Test Message" in Email Notification UI
- **Priority**: Medium
- **Status**: Tested
- **Created**: 10/15/2025

## Description
[As provided in the user story]

---

## Test Cases

### Test Case 1: Verify Button Text Change in Email Notification UI
**Objective**: Verify that the "Share" button text has been correctly renamed to "Send Test Message"

**Preconditions**:
- User is logged in as Developer or System Administrator
- User has access to Email Notification module
- Email Notification UI is accessible

**Test Steps**:
1. Navigate to Email Notification module
2. Locate the button previously labeled as "Share"
3. Observe the button text

**Expected Results**:
- Button text displays "Send Test Message"
- Text is properly formatted and aligned
- No UI distortions are present

**Test Data**: N/A

**Priority**: High

---

### Test Case 2: Verify Button Functionality Remains Unchanged
**Objective**: Ensure the button's core functionality remains the same after the text change

**Preconditions**:
- User is logged in with appropriate permissions
- Valid email template exists
- Test recipient email address is configured

**Test Steps**:
1. Navigate to Email Notification module
2. Select an email template
3. Click "Send Test Message" button
4. Check if test email is sent

**Expected Results**:
- Test email is sent successfully
- Confirmation message appears
- Email is received by test recipient

**Test Data**: 
- Test email template
- Test recipient email address

**Priority**: High

---

### Test Case 3: Verify Button Accessibility Properties
**Objective**: Ensure accessibility attributes are properly maintained after text change

**Preconditions**:
- User has access to Email Notification module
- Screen reader is enabled

**Test Steps**:
1. Navigate to Email Notification module
2. Tab to the "Send Test Message" button
3. Check button's ARIA labels and accessibility properties
4. Test with screen reader

**Expected Results**:
- Button is properly focusable
- Screen reader reads "Send Test Message"
- All accessibility attributes are preserved

**Test Data**: N/A

**Priority**: Medium

---

### Test Case 4: Verify Button State Handling
**Objective**: Verify button states (enabled/disabled) work correctly

**Preconditions**:
- User has access to Email Notification module
- Various email template states are available

**Test Steps**:
1. Navigate to Email Notification module
2. Check button state with no template selected
3. Select valid template and check button state
4. Select invalid/incomplete template and check button state

**Expected Results**:
- Button is disabled when no template is selected
- Button is enabled with valid template
- Button is disabled with invalid template
- Button state visual indicators are clear

**Test Data**: 
- Valid and invalid email templates

**Priority**: Medium

---

### Test Case 5: Verify UI Responsiveness
**Objective**: Ensure button text displays correctly across different screen sizes

**Preconditions**:
- Access to different devices/screen sizes
- Email Notification module is loaded

**Test Steps**:
1. Test on desktop browser (1920x1080)
2. Test on tablet resolution (768x1024)
3. Test on mobile resolution (375x667)
4. Check button text wrapping and alignment

**Expected Results**:
- Button text is clearly visible on all screen sizes
- No text truncation occurs
- Button maintains proper alignment and spacing

**Test Data**: N/A

**Priority**: Medium

---

### Test Case 6: Verify Localization (Negative Test)
**Objective**: Ensure button text change doesn't break existing localizations

**Preconditions**:
- Multiple language settings are available
- User can switch between languages

**Test Steps**:
1. Change system language to non-English options
2. Navigate to Email Notification module
3. Verify button text in different languages

**Expected Results**:
- Button text is properly translated
- No missing translations
- No placeholder/default text shown

**Test Data**: 
- List of supported languages

**Priority**: Medium

---

## Edge Cases and Negative Tests

### Test Case 7: Handle Special Characters in Button Text
**Objective**: Verify button text rendering with special characters

**Preconditions**:
- Access to Email Notification module
- Ability to modify system language/locale

**Test Steps**:
1. Test with RTL languages
2. Test with languages containing special characters
3. Verify button text rendering

**Expected Results**:
- Text renders correctly in all cases
- No character encoding issues
- Proper text alignment maintained

**Test Data**: 
- RTL language settings
- Special character test cases

**Priority**: Low

---

## Notes
- Ensure testing across different browsers (Chrome, Firefox, Safari, Edge)
- Verify with different user roles and permission levels
- Check integration with email service providers
- Document any UI automation test updates needed
- Update relevant test documentation and screenshots