# TC-016: Invalid Quantity Input Validation

## Test Case Information

**Test Case ID**: TC-016  
**Test Case Title**: Verify Validation of Invalid Quantity Inputs  
**Related Story**: [VCST-4003](https://virtocommerce.atlassian.net/browse/VCST-4003)  
**Priority**: Medium  
**Test Type**: Validation / Edge Case  
**Estimated Time**: 15 minutes

---

## Description

Verify that the system properly validates and handles invalid quantity inputs, including negative numbers, decimals, non-numeric characters, extremely large numbers, and other edge cases. Ensure appropriate error messages are shown and system doesn't crash.

---

## Preconditions

1. User is logged into the VirtoCommerce platform
2. User is on a category page with products
3. Products are in cart
4. Quantity input field is accessible

---

## Test Data

- **Test User**: `test_user@example.com`
- **Products**: At least 3 products in cart

---

## Test Steps

### Step 1: Negative Numbers
1. Click into quantity input field
2. Type "-5"
3. Press Enter or Tab out

**Expected Result**:
- System either:
  - **Prevents entry**: Minus sign not accepted
  - **Shows validation error**: "Quantity must be positive"
  - **Converts to positive**: Shows "5"
  - **Sets to minimum**: Sets to 0 or 1
- No mutation sent with negative value
- No system crash

---

### Step 2: Zero (Already Covered in TC-006, but verify validation)
1. Type "0" in quantity field
2. Press Enter

**Expected Result**:
- Product removed from cart (as per TC-006)
- OR validation message if removal requires explicit action

---

### Step 3: Decimal Numbers
1. Type "5.5" in quantity field
2. Press Enter

**Expected Result**:
- System either:
  - **Prevents decimal entry**: Only integers allowed
  - **Rounds**: Automatically rounds to 5 or 6
  - **Shows error**: "Please enter a whole number"
- No decimal quantities in cart

---

### Step 4: Non-Numeric Characters (Letters)
1. Type "abc" in quantity field
2. Press Enter

**Expected Result**:
- System either:
  - **Prevents non-numeric entry**: Letters not accepted
  - **Shows error**: "Please enter a valid number"
  - **Clears field**: Reverts to previous value
- No mutation sent with invalid data

---

### Step 5: Special Characters
1. Try entering various special characters:
   - "!@#$%"
   - "***"
   - ",,,"
2. Observe behavior

**Expected Result**:
- Special characters prevented or rejected
- Clear error message
- Field validation works

---

### Step 6: Extremely Large Numbers
1. Type "9999999999" (10 billion)
2. Press Enter

**Expected Result**:
- System either:
  - **Accepts if within limits**: Allows if no max defined
  - **Caps at maximum**: Sets to max allowed (e.g., 9999)
  - **Shows error**: "Quantity exceeds maximum of XXX"
- No integer overflow
- System remains stable

---

### Step 7: Scientific Notation
1. Type "1e5" (scientific notation for 100,000)
2. Press Enter

**Expected Result**:
- System either:
  - **Converts**: Interprets as 100000
  - **Rejects**: Shows validation error
- Behavior is consistent and documented

---

### Step 8: Empty String / Blank Field
1. Clear quantity field completely (delete all text)
2. Press Enter or Tab out

**Expected Result**:
- System either:
  - **Reverts**: Returns to previous value
  - **Sets to minimum**: Sets to 0 or 1
  - **Shows error**: "Quantity required"
- Doesn't send mutation with empty value

---

### Step 9: Leading Zeros
1. Type "005" in quantity field
2. Press Enter

**Expected Result**:
- Converts to "5" (removes leading zeros)
- Mutation sent with value 5
- No parsing errors

---

### Step 10: Whitespace
1. Type " 5 " (with spaces before and after)
2. Press Enter

**Expected Result**:
- Whitespace trimmed
- Converts to "5"
- Works correctly

---

### Step 11: Mixed Valid/Invalid Input
1. Type "5abc3"
2. Press Enter

**Expected Result**:
- System either:
  - **Rejects entirely**: Shows error
  - **Extracts numbers**: Uses "53"
  - **Validates**: Clear behavior documented

---

### Step 12: SQL Injection Attempt (Security Test)
1. Type SQL injection string: `'; DROP TABLE cart; --`
2. Press Enter

**Expected Result**:
- Input properly sanitized
- No SQL injection vulnerability
- Either rejected or escaped
- **CRITICAL**: No database damage

---

### Step 13: XSS Attempt (Security Test)
1. Type XSS string: `<script>alert('XSS')</script>`
2. Press Enter

**Expected Result**:
- Script not executed
- HTML escaped and not rendered
- No XSS vulnerability
- **CRITICAL**: No security breach

---

### Step 14: Very Long String
1. Type a very long string (1000+ characters of numbers)
2. Press Enter

**Expected Result**:
- Input truncated or rejected
- No buffer overflow
- System remains stable
- Clear error message

---

### Step 15: Copy-Paste Invalid Data
1. Copy invalid text (e.g., from word processor with formatting)
2. Paste into quantity field
3. Press Enter

**Expected Result**:
- Formatting stripped
- Valid number extracted or error shown
- No parsing errors

---

### Step 16: Validation During Rapid Changes
1. Rapidly type and delete numbers
2. Include invalid characters in the rapid typing
3. Observe validation behavior

**Expected Result**:
- Validation keeps up with rapid input
- No UI lag or freeze
- Consistent behavior

---

### Step 17: Keyboard Arrows (If Supported)
1. Focus quantity field
2. Press Up/Down arrows
3. Try to arrow down below 0 or up above max

**Expected Result**:
- Arrows increment/decrement by 1
- Stops at minimum (0 or 1)
- Stops at maximum (if defined)
- Doesn't go negative

---

### Step 18: Test on Mobile (Touch Keyboard)
1. (On mobile device or emulator)
2. Tap quantity field
3. Observe keyboard type shown

**Expected Result**:
- Numeric keyboard shown (type="number" or inputmode="numeric")
- Easier for mobile users to enter numbers
- Validation still works on mobile

---

## Validation Rules Summary

| Input Type | Expected Behavior |
|------------|-------------------|
| Negative numbers | Rejected or converted to positive |
| Zero | Removes item from cart |
| Decimals | Rejected or rounded to integer |
| Letters | Rejected |
| Special chars | Rejected |
| Very large numbers | Capped at maximum or error |
| Empty | Reverts or sets to minimum |
| SQL/XSS attempts | Sanitized, no security breach |
| Leading zeros | Removed, number parsed correctly |
| Whitespace | Trimmed |

---

## Expected Results Summary

✅ **Rejects Invalid Input**: Non-numeric, negative, special characters rejected  
✅ **Clear Error Messages**: User understands what's wrong  
✅ **Decimal Handling**: Decimals rounded or rejected appropriately  
✅ **Large Number Handling**: Extremely large numbers capped or handled  
✅ **Security**: No SQL injection or XSS vulnerabilities  
✅ **No Crashes**: System stable with all invalid inputs  
✅ **Mobile Friendly**: Numeric keyboard on mobile  
✅ **Consistent**: Same validation rules across all products

---

## Actual Results

**Execution Date**: ___________  
**Executed By**: ___________  
**Browser**: ___________  
**Environment**: ___________

### Observations:
```
[To be filled during test execution]

Negative numbers: Rejected/Accepted/Converted
Decimals: Rejected/Rounded
Letters: Prevented/Error shown
Extremely large numbers: Capped at ___
Empty field: Reverts/Error
SQL injection prevented: Yes/No
XSS prevented: Yes/No
Mobile numeric keyboard: Yes/No

Error messages shown:
"___"
```

---

## Pass/Fail Criteria

**Pass**: 
- All invalid inputs properly validated
- Clear, helpful error messages
- No system crashes or errors
- No security vulnerabilities (SQL injection, XSS)
- Consistent validation across all products
- Mobile-friendly (numeric keyboard)

**Fail**: 
- Invalid inputs accepted and processed
- No validation or error messages
- System crashes on invalid input
- Security vulnerabilities present
- Inconsistent validation
- Poor mobile experience

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

- Input validation is critical for data integrity and security
- Test both client-side and server-side validation
- Client-side validation provides immediate feedback
- Server-side validation is essential for security
- Consider accessibility (error messages for screen readers)
- Document all validation rules for developers

---

## Security Checklist

- [ ] SQL injection attempts properly sanitized
- [ ] XSS attempts properly escaped
- [ ] No arbitrary code execution possible
- [ ] Input length limits enforced
- [ ] No buffer overflow vulnerabilities
- [ ] Server-side validation in place
- [ ] Error messages don't reveal system internals

---

## Screenshots/Evidence

[Attach screenshots or video recordings here]

1. Error message for negative number
2. Error message for letters
3. Error message for too large number
4. Validation preventing special characters
5. Mobile numeric keyboard
6. SQL/XSS injection attempts (blocked)

