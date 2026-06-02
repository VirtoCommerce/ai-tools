# CyberSource Credit Card Form - Validation Test Cases

**JIRA:** VCST-3387  
**Payment Provider:** CyberSource  
**Test Environment:** QA (https://vcst-qa-storefront.govirto.com/)  
**Test Data Source:** Regression/orderCreationMatrix.txt  
**Date:** December 9, 2025

---

## Test Data from Order Creation Matrix

**Valid CyberSource Test Card:**
- **Card Number:** 4622943127013705
- **CVV:** 838
- **Expiration Date:** 09/2029
- **Card Type:** Visa
- **Cardholder Name:** (Any valid name)

---

## 1. POSITIVE TEST CASES (Valid Data)

### TC-POS-001: Complete Valid Form Submission
**Objective:** Verify successful order creation with all valid CyberSource card details

**Priority:** Critical  
**Type:** Positive  

**Preconditions:**
- User logged in
- Product in cart
- Shipping method selected: Fixed rate (Ground)
- Payment method: Bank card (CyberSource) selected

**Test Data:**
- Card Number: `4622943127013705`
- Cardholder Name: `John Smith`
- Expiration Date: `09/2029`
- CVV: `838`

**Steps:**
1. Navigate to cart/checkout page
2. Select "Bank card (CyberSource)" payment method
3. Wait for credit card form to display
4. Enter card number: 4622943127013705
5. Enter cardholder name: John Smith
6. Enter expiration date: 09/2029
7. Enter CVV: 838
8. Click "Place order" button
9. Wait for order confirmation

**Expected Results:**
- ✅ All fields accept input without errors
- ✅ No validation errors displayed
- ✅ Order is created successfully
- ✅ Payment is authorized
- ✅ User redirected to order confirmation page
- ✅ Order number displayed
- ✅ Payment status: Authorized/Completed

**Evidence Required:** Screenshots, console logs, network logs (authorizePayment API call)

---

### TC-POS-002: Valid Card with Fixed Rate (Air)
**Objective:** Verify CyberSource payment works with Air shipping

**Priority:** High  
**Type:** Positive  

**Preconditions:**
- Shipping method: Fixed rate (Air)
- Payment method: Bank card (CyberSource)

**Test Data:**
- Card Number: `4622943127013705`
- Cardholder Name: `Jane Doe`
- Expiration Date: `09/2029`
- CVV: `838`

**Steps:**
1. Select Fixed rate (Air) shipping method
2. Select Bank card (CyberSource)
3. Fill all credit card fields with valid data
4. Submit order

**Expected Results:**
- ✅ Order created with Air shipping
- ✅ Payment authorized
- ✅ Correct shipping cost applied
- ✅ Order total calculated correctly

---

### TC-POS-003: Valid Card with Pickup
**Objective:** Verify CyberSource payment works with Pickup delivery

**Priority:** High  
**Type:** Positive  

**Preconditions:**
- Delivery option: Pickup
- Payment method: Bank card (CyberSource)

**Test Data:**
- Card Number: `4622943127013705`
- Cardholder Name: `Test User`
- Expiration Date: `09/2029`
- CVV: `838`

**Steps:**
1. Select Pickup delivery option
2. Select Bank card (CyberSource)
3. Fill all credit card fields
4. Submit order

**Expected Results:**
- ✅ Order created with Pickup option
- ✅ Payment authorized
- ✅ No shipping cost applied (Pickup)
- ✅ Pickup location details shown

---

### TC-POS-004: Cardholder Name with Special Characters
**Objective:** Verify valid special characters accepted in cardholder name

**Priority:** Medium  
**Type:** Positive  

**Test Data:**
- Cardholder Name Variations:
  - `Mary-Jane O'Connor` (hyphen and apostrophe)
  - `José García` (accented characters)
  - `Van Der Berg` (multiple spaces)
  - `Smith Jr.` (period)

**Steps:**
1. Enter each name variation
2. Complete form with valid card details
3. Submit order

**Expected Results:**
- ✅ Valid special characters accepted (hyphen, apostrophe, accents, periods)
- ✅ Multiple spaces handled correctly
- ✅ Name stored correctly in order
- ✅ No validation errors

---

### TC-POS-005: Expiration Date Format Variations
**Objective:** Verify different valid expiration date input formats

**Priority:** Medium  
**Type:** Positive  

**Test Data:**
- Format variations for 09/2029:
  - `09/2029` (MM/YYYY)
  - `09 / 2029` (with spaces)
  - `092029` (no separator)

**Steps:**
1. Try each format variation
2. Verify auto-formatting
3. Complete order

**Expected Results:**
- ✅ All valid formats accepted
- ✅ Auto-formatting to `MM / YYYY`
- ✅ Date validation passes
- ✅ Order processes successfully

---

## 2. NEGATIVE TEST CASES (Invalid Data)

### TC-NEG-001: Invalid Card Number
**Objective:** Verify validation for invalid card numbers

**Priority:** Critical  
**Type:** Negative  

**Test Data:**
- Invalid Card Numbers:
  - `1234567890123456` (fails Luhn algorithm)
  - `4622943127013700` (wrong check digit)
  - `0000000000000000` (all zeros)
  - `9999999999999999` (all nines)

**Steps:**
1. Enter invalid card number
2. Tab out of field or attempt to submit
3. Observe validation

**Expected Results:**
- ✅ Validation error displayed
- ✅ Error message: "Invalid card number" or similar
- ✅ Field highlighted as invalid
- ✅ Cannot submit order
- ✅ Error is clear and helpful

---

### TC-NEG-002: Empty Card Number
**Objective:** Verify required field validation for card number

**Priority:** Critical  
**Type:** Negative  

**Steps:**
1. Leave card number field empty
2. Fill other fields with valid data
3. Attempt to submit order

**Expected Results:**
- ✅ Validation error: "Card number is required"
- ✅ Field highlighted as required
- ✅ Cannot submit form
- ✅ Focus returns to card number field

---

### TC-NEG-003: Empty Cardholder Name
**Objective:** Verify required field validation for cardholder name

**Priority:** Critical  
**Type:** Negative  

**Steps:**
1. Leave cardholder name field empty
2. Fill other fields with valid data
3. Attempt to submit order

**Expected Results:**
- ✅ Validation error: "Cardholder name is required"
- ✅ Field highlighted as invalid
- ✅ Cannot submit order
- ✅ Other fields retain their values

---

### TC-NEG-004: Expired Card (Past Expiration Date)
**Objective:** Verify validation for expired cards

**Priority:** Critical  
**Type:** Negative  

**Test Data:**
- Past expiration dates:
  - `01/2020` (years ago)
  - `12/2024` (last year)
  - `11/2025` (last month - if current is December 2025)

**Steps:**
1. Enter valid card number: 4622943127013705
2. Enter past expiration date
3. Fill other fields
4. Attempt to submit

**Expected Results:**
- ✅ Validation error: "Card is expired" or "Invalid expiration date"
- ✅ Field highlighted as invalid
- ✅ Cannot submit order
- ✅ Clear error message

---

### TC-NEG-005: Empty Expiration Date
**Objective:** Verify required field validation for expiration date

**Priority:** Critical  
**Type:** Negative  

**Steps:**
1. Leave expiration date field empty
2. Fill other fields with valid data
3. Attempt to submit

**Expected Results:**
- ✅ Validation error: "Expiration date is required"
- ✅ Field highlighted as required
- ✅ Cannot submit order

---

### TC-NEG-006: Invalid Expiration Date Format
**Objective:** Verify validation for malformed expiration dates

**Priority:** High  
**Type:** Negative  

**Test Data:**
- Invalid formats:
  - `13/2029` (invalid month - greater than 12)
  - `00/2029` (invalid month - zero)
  - `99/2029` (invalid month)
  - `09/1999` (year too far in past)
  - `abc/defg` (alphabetic characters)

**Steps:**
1. Enter invalid expiration date
2. Attempt to submit or tab out

**Expected Results:**
- ✅ Validation error displayed
- ✅ Error message explains the issue
- ✅ Cannot submit with invalid date
- ✅ Field highlighted

---

### TC-NEG-007: Invalid CVV (Wrong Length)
**Objective:** Verify CVV length validation

**Priority:** High  
**Type:** Negative  

**Test Data:**
- Invalid CVVs:
  - `12` (too short - 2 digits)
  - `1` (too short - 1 digit)
  - `12345` (too long - 5 digits)

**Steps:**
1. Enter valid card and other details
2. Enter invalid CVV
3. Attempt to submit

**Expected Results:**
- ✅ Validation error for incorrect CVV length
- ✅ Field highlighted as invalid
- ✅ Error message: "CVV must be 3 digits" (or 4 for Amex)
- ✅ Cannot submit order

---

### TC-NEG-008: Empty CVV/Security Code
**Objective:** Verify required field validation for CVV

**Priority:** Critical  
**Type:** Negative  

**Steps:**
1. Fill all fields except CVV
2. Leave CVV field empty
3. Attempt to submit

**Expected Results:**
- ✅ Validation error: "Security code is required"
- ✅ Field highlighted
- ✅ Cannot submit order

---

### TC-NEG-009: Non-Numeric Characters in CVV
**Objective:** Verify CVV only accepts numeric input

**Priority:** Medium  
**Type:** Negative  

**Test Data:**
- Invalid CVV inputs:
  - `abc` (alphabetic)
  - `!@#` (special characters)
  - `8a8` (mixed)

**Steps:**
1. Attempt to type non-numeric characters in CVV field
2. Observe field behavior

**Expected Results:**
- ✅ Non-numeric characters rejected
- ✅ Only numbers accepted
- ✅ Field only contains digits
- ✅ Or validation error shown on submit

---

### TC-NEG-010: Invalid Cardholder Name (Numbers/Special Chars)
**Objective:** Verify cardholder name validation rules

**Priority:** Medium  
**Type:** Negative  

**Test Data:**
- Invalid names:
  - `123456` (all numbers)
  - `John@Smith` (@ symbol)
  - `Test#User` (# symbol)
  - `User<>Test` (angle brackets)
  - `!!!` (only special characters)

**Steps:**
1. Enter invalid cardholder name
2. Fill other fields
3. Attempt to submit

**Expected Results:**
- ✅ Validation error or input rejection
- ✅ Invalid characters not accepted (or sanitized)
- ✅ Error message explains requirements
- ✅ Cannot submit with invalid name

---

### TC-NEG-011: Card Number with Non-Numeric Characters
**Objective:** Verify card number field only accepts digits

**Priority:** High  
**Type:** Negative  

**Test Data:**
- Invalid inputs:
  - `abcd-efgh-ijkl-mnop` (letters)
  - `4622-943a-1270-13705` (mixed)
  - `4622 943! 1270 13705` (special chars)

**Steps:**
1. Attempt to type non-numeric characters in card number field
2. Or paste invalid data

**Expected Results:**
- ✅ Non-numeric characters rejected/stripped
- ✅ Only digits accepted
- ✅ Or validation error on submit

---

### TC-NEG-012: Incomplete Card Number
**Objective:** Verify validation for too-short card numbers

**Priority:** High  
**Type:** Negative  

**Test Data:**
- Incomplete numbers:
  - `4622` (4 digits)
  - `46229431` (8 digits)
  - `462294312701` (12 digits)

**Steps:**
1. Enter incomplete card number
2. Fill other fields
3. Attempt to submit

**Expected Results:**
- ✅ Validation error: "Card number is incomplete" or "Invalid card number"
- ✅ Minimum length validation (typically 13-19 digits)
- ✅ Cannot submit order

---

### TC-NEG-013: Card Number Too Long
**Objective:** Verify maximum length validation for card number

**Priority:** Medium  
**Type:** Negative  

**Test Data:**
- `46229431270137051234567890` (26 digits - too long)

**Steps:**
1. Attempt to enter very long card number
2. Observe field behavior

**Expected Results:**
- ✅ Field limits input to maximum length (19 digits)
- ✅ Or validation error shown
- ✅ Cannot enter more than max digits

---

## 3. EDGE CASES

### TC-EDGE-001: Current Month Expiration (Boundary)
**Objective:** Verify handling of card expiring in current month

**Priority:** High  
**Type:** Edge Case  

**Test Data:**
- Expiration Date: Current month/year (e.g., 12/2025 if testing in December 2025)

**Steps:**
1. Enter card expiring in current month
2. Complete form
3. Submit order

**Expected Results:**
- ✅ Card accepted (expires end of month) OR
- ✅ Validation error if considering it expired
- ✅ Consistent behavior
- ✅ Clear messaging

---

### TC-EDGE-002: Far Future Expiration Date
**Objective:** Verify handling of card with distant future expiration

**Priority:** Medium  
**Type:** Edge Case  

**Test Data:**
- Expiration Date: `12/2099` (far future)

**Steps:**
1. Enter valid card number
2. Enter far future expiration: 12/2099
3. Complete form
4. Submit order

**Expected Results:**
- ✅ Date accepted OR
- ✅ Reasonable maximum year validation (e.g., 20 years from now)
- ✅ Appropriate handling
- ✅ No system errors

---

### TC-EDGE-003: Next Month Expiration (Boundary)
**Objective:** Verify card expiring next month is accepted

**Priority:** High  
**Type:** Edge Case  

**Test Data:**
- Expiration Date: Next month (e.g., 01/2026 if testing in December 2025)

**Steps:**
1. Enter card expiring next month
2. Complete form
3. Submit

**Expected Results:**
- ✅ Card accepted (valid future date)
- ✅ No validation errors
- ✅ Order processes successfully

---

### TC-EDGE-004: Minimum Valid Card Number (13 digits)
**Objective:** Verify shortest valid card numbers accepted

**Priority:** Medium  
**Type:** Edge Case  

**Test Data:**
- 13-digit card number (if supported): e.g., `4622943127013` (shortened test)

**Steps:**
1. Enter 13-digit card number
2. Complete form
3. Submit

**Expected Results:**
- ✅ 13-digit card accepted if valid OR
- ✅ Appropriate validation if minimum is 15-16 digits
- ✅ Consistent with card network rules

---

### TC-EDGE-005: Maximum Valid Card Number (19 digits)
**Objective:** Verify longest valid card numbers accepted

**Priority:** Medium  
**Type:** Edge Case  

**Test Data:**
- 19-digit card number (if test card available)

**Steps:**
1. Enter 19-digit card number
2. Complete form
3. Submit

**Expected Results:**
- ✅ 19-digit card accepted if valid
- ✅ Proper formatting applied
- ✅ No truncation issues

---

### TC-EDGE-006: Cardholder Name - Single Character
**Objective:** Verify minimum length for cardholder name

**Priority:** Low  
**Type:** Edge Case  

**Test Data:**
- Cardholder Name: `X` (single character)

**Steps:**
1. Enter single character name
2. Complete form
3. Submit

**Expected Results:**
- ✅ Accepted with warning OR
- ✅ Minimum length validation (e.g., 2 characters minimum)
- ✅ Clear messaging if rejected

---

### TC-EDGE-007: Cardholder Name - Maximum Length
**Objective:** Verify maximum length handling for cardholder name

**Priority:** Low  
**Type:** Edge Case  

**Test Data:**
- Very long name: `Bartholomew Fitzgerald Christopher Montgomery Wellington III`

**Steps:**
1. Enter very long cardholder name
2. Observe field behavior
3. Complete form

**Expected Results:**
- ✅ Name accepted up to reasonable maximum (e.g., 50-100 characters)
- ✅ Field limits input OR
- ✅ Truncation with warning
- ✅ No system errors

---

### TC-EDGE-008: Cardholder Name - Only Spaces
**Objective:** Verify validation prevents empty/whitespace-only names

**Priority:** Medium  
**Type:** Edge Case  

**Test Data:**
- Cardholder Name: `     ` (only spaces)

**Steps:**
1. Enter only spaces in cardholder name
2. Attempt to submit

**Expected Results:**
- ✅ Validation error: "Cardholder name is required"
- ✅ Whitespace-only input treated as empty
- ✅ Cannot submit

---

### TC-EDGE-009: Expiration Date - December Boundary
**Objective:** Verify December dates handled correctly

**Priority:** Medium  
**Type:** Edge Case  

**Test Data:**
- Expiration Date: `12/2029` (December)

**Steps:**
1. Enter December expiration
2. Complete form
3. Submit

**Expected Results:**
- ✅ December date accepted
- ✅ Proper validation
- ✅ No off-by-one errors

---

### TC-EDGE-010: Expiration Date - January Boundary
**Objective:** Verify January dates (year boundary) handled correctly

**Priority:** Medium  
**Type:** Edge Case  

**Test Data:**
- Expiration Date: `01/2026` (January, new year)

**Steps:**
1. Enter January expiration
2. Complete form
3. Submit

**Expected Results:**
- ✅ January date accepted
- ✅ Year transition handled correctly
- ✅ No calendar boundary issues

---

### TC-EDGE-011: CVV with Leading Zeros
**Objective:** Verify CVV preserves leading zeros

**Priority:** Medium  
**Type:** Edge Case  

**Test Data:**
- CVV: `038` (leading zero)
- CVV: `008` (two leading zeros)

**Steps:**
1. Enter CVV with leading zeros
2. Complete form
3. Submit

**Expected Results:**
- ✅ Leading zeros preserved
- ✅ CVV accepted as valid
- ✅ No trimming of leading zeros
- ✅ Payment processes correctly

---

### TC-EDGE-012: Form Persistence After Validation Error
**Objective:** Verify form data persists when validation fails

**Priority:** High  
**Type:** Edge Case  

**Steps:**
1. Fill entire form with valid data
2. Change expiration date to expired date: `01/2020`
3. Click "Place order"
4. Observe validation error
5. Check if other fields retain values

**Expected Results:**
- ✅ Validation error for expired date shown
- ✅ Card number value retained
- ✅ Cardholder name value retained
- ✅ CVV value retained (if not masked)
- ✅ User only needs to fix expiration date
- ✅ No need to re-enter all data

---

### TC-EDGE-013: Copy/Paste Card Number
**Objective:** Verify card number handles copy/paste correctly

**Priority:** High  
**Type:** Edge Case  

**Test Data:**
- Paste variations:
  - `4622943127013705` (no spaces)
  - `4622 9431 2701 3705` (with spaces)
  - `4622-9431-2701-3705` (with dashes)

**Steps:**
1. Copy card number from external source
2. Paste into card number field
3. Verify formatting

**Expected Results:**
- ✅ All variations accepted
- ✅ Non-numeric characters stripped
- ✅ Auto-formatting applied
- ✅ Valid card number recognized

---

### TC-EDGE-014: Special Characters in Cardholder Name
**Objective:** Verify handling of potentially problematic characters

**Priority:** Medium  
**Type:** Edge Case  

**Test Data:**
- Problematic names:
  - `O'Connor-Smith` (multiple special chars)
  - `María José` (space + accents)
  - `    John   Smith    ` (extra spaces)

**Steps:**
1. Enter name with special characters
2. Submit form

**Expected Results:**
- ✅ Valid special chars accepted (apostrophe, hyphen, accents)
- ✅ Extra spaces trimmed or handled
- ✅ Name stored correctly
- ✅ No SQL injection or XSS vulnerabilities

---

### TC-EDGE-015: Rapid Form Switching
**Objective:** Verify form stability when switching payment methods rapidly

**Priority:** Medium  
**Type:** Edge Case  

**Steps:**
1. Select Bank card (CyberSource)
2. Fill some fields
3. Switch to different payment method
4. Switch back to Bank card (CyberSource)
5. Check form state

**Expected Results:**
- ✅ Form resets or retains appropriate data
- ✅ No JavaScript errors
- ✅ Iframes reload correctly
- ✅ No duplicate forms rendered

---

## 4. FIELD-SPECIFIC VALIDATION TESTS

### TC-VAL-001: Card Number - Luhn Algorithm Validation
**Objective:** Verify Luhn check digit validation

**Priority:** Critical  
**Type:** Validation  

**Test Data:**
- Valid Luhn: `4622943127013705` ✅
- Invalid Luhn: `4622943127013704` ❌ (changed last digit)

**Steps:**
1. Enter card with invalid Luhn checksum
2. Attempt to submit

**Expected Results:**
- ✅ Luhn validation performed
- ✅ Invalid checksum rejected
- ✅ Error: "Invalid card number"

---

### TC-VAL-002: Card Number - Visa Detection
**Objective:** Verify Visa card type detection

**Priority:** Medium  
**Type:** Validation  

**Test Data:**
- Visa card: `4622943127013705` (starts with 4)

**Steps:**
1. Enter Visa card number
2. Observe card type indicator

**Expected Results:**
- ✅ Visa icon highlighted/displayed
- ✅ Card type detected correctly
- ✅ Other card icons dimmed or hidden
- ✅ Visual feedback to user

---

### TC-VAL-003: Card Number - Auto-Formatting
**Objective:** Verify automatic spacing for card number

**Priority:** Medium  
**Type:** Validation  

**Test Data:**
- Input: `4622943127013705` (no spaces)
- Expected format: `4622 9431 2701 3705` (with spaces)

**Steps:**
1. Type card number without spaces
2. Observe real-time formatting

**Expected Results:**
- ✅ Spaces automatically inserted
- ✅ Format: `#### #### #### ####`
- ✅ Formatting happens as user types
- ✅ Cursor position maintained

---

### TC-VAL-004: Expiration Date - Auto-Formatting
**Objective:** Verify automatic slash insertion for expiration date

**Priority:** Medium  
**Type:** Validation  

**Test Data:**
- Input: `092029` (no slash)
- Expected: `09 / 2029` (with slash and spaces)

**Steps:**
1. Type expiration date without slash
2. Observe auto-formatting

**Expected Results:**
- ✅ Slash automatically inserted
- ✅ Format: `MM / YYYY`
- ✅ Formatting happens during typing
- ✅ User-friendly input experience

---

### TC-VAL-005: Expiration Date - Month Validation
**Objective:** Verify month is between 01-12

**Priority:** High  
**Type:** Validation  

**Test Data:**
- Month 00: `00/2029` ❌
- Month 13: `13/2029` ❌
- Month 99: `99/2029` ❌
- Month 01: `01/2029` ✅
- Month 12: `12/2029` ✅

**Steps:**
1. Enter each month value
2. Verify validation

**Expected Results:**
- ✅ Months 01-12 accepted
- ✅ Month 00 rejected
- ✅ Month 13+ rejected
- ✅ Clear error messages

---

### TC-VAL-006: CVV - Masking/Security
**Objective:** Verify CVV field is properly masked for security

**Priority:** High  
**Type:** Validation  

**Steps:**
1. Enter CVV: 838
2. Observe field display
3. Tab out of field
4. Check if value is masked

**Expected Results:**
- ✅ CVV displayed as bullets (•••) or asterisks (***)
- ✅ Actual digits not visible after entry
- ✅ Security maintained
- ✅ Value properly protected

---

### TC-VAL-007: Required Field Indicators
**Objective:** Verify all required fields are properly marked

**Priority:** Medium  
**Type:** Validation  

**Steps:**
1. Observe form when displayed
2. Check each field label

**Expected Results:**
- ✅ Card number has asterisk (*) or "required" indicator
- ✅ Cardholder name has required indicator
- ✅ Expiration date has required indicator
- ✅ CVV has required indicator
- ✅ Visual distinction from optional fields

---

### TC-EDGE-016: Form Submission Without Card Number
**Objective:** Verify specific error for missing card number

**Priority:** Critical  
**Type:** Edge Case  

**Steps:**
1. Leave card number empty
2. Fill all other fields with valid data:
   - Cardholder: John Smith
   - Expiry: 09/2029
   - CVV: 838
3. Click "Place order"

**Expected Results:**
- ✅ Validation error specifically for card number
- ✅ Message: "Card number is required" or similar
- ✅ Field highlighted
- ✅ Other fields keep their values
- ✅ Focus moves to card number field

---

### TC-EDGE-017: Form Submission With Only Card Number
**Objective:** Verify all other fields validated when card number is valid

**Priority:** High  
**Type:** Edge Case  

**Steps:**
1. Enter only valid card number: 4622943127013705
2. Leave all other fields empty
3. Click "Place order"

**Expected Results:**
- ✅ Multiple validation errors shown:
  - "Cardholder name is required"
  - "Expiration date is required"
  - "Security code is required"
- ✅ All required fields highlighted
- ✅ Clear which fields need attention

---

### TC-EDGE-018: Whitespace in Card Number
**Objective:** Verify card number handles whitespace correctly

**Priority:** Medium  
**Type:** Edge Case  

**Test Data:**
- With extra spaces: `  4622  9431  2701  3705  `
- Leading/trailing spaces: `   4622943127013705   `

**Steps:**
1. Paste or enter card number with extra whitespace
2. Verify processing

**Expected Results:**
- ✅ Whitespace automatically trimmed
- ✅ Card number normalized
- ✅ Validation against clean number
- ✅ No errors from spacing

---

### TC-EDGE-019: Case Sensitivity in Cardholder Name
**Objective:** Verify cardholder name accepts various cases

**Priority:** Low  
**Type:** Edge Case  

**Test Data:**
- All uppercase: `JOHN SMITH`
- All lowercase: `john smith`
- Mixed case: `JoHn SmItH`
- Title case: `John Smith`

**Steps:**
1. Enter each case variation
2. Submit form

**Expected Results:**
- ✅ All case variations accepted
- ✅ No forced case conversion (or appropriate conversion)
- ✅ Name stored as entered
- ✅ No validation errors

---

### TC-EDGE-020: Double-Clicking Place Order Button
**Objective:** Verify duplicate order prevention

**Priority:** High  
**Type:** Edge Case  

**Steps:**
1. Fill form with valid CyberSource card data
2. Double-click "Place order" button rapidly
3. Observe system behavior

**Expected Results:**
- ✅ Only one order created
- ✅ Button disabled after first click
- ✅ Loading indicator shown
- ✅ No duplicate charges
- ✅ Proper order de-duplication

---

## 5. CROSS-FIELD VALIDATION TESTS

### TC-CROSS-001: All Fields Empty Submission
**Objective:** Verify validation when submitting completely empty form

**Priority:** Critical  
**Type:** Validation  

**Steps:**
1. Select Bank card (CyberSource)
2. Leave ALL fields empty
3. Click "Place order"

**Expected Results:**
- ✅ Validation errors for all required fields shown
- ✅ Clear messaging: "Please fill all required fields"
- ✅ All fields highlighted as invalid
- ✅ Cannot submit
- ✅ User knows what to fix

---

### TC-CROSS-002: Valid Card with Invalid Name
**Objective:** Verify independent field validation

**Priority:** High  
**Type:** Validation  

**Test Data:**
- Card Number: `4622943127013705` ✅
- Cardholder Name: `12345` ❌
- Expiration: `09/2029` ✅
- CVV: `838` ✅

**Steps:**
1. Enter valid card, expiry, CVV
2. Enter invalid (numeric) cardholder name
3. Submit

**Expected Results:**
- ✅ Error specifically for cardholder name
- ✅ Card number, expiry, CVV remain valid
- ✅ Only invalid field highlighted
- ✅ Targeted error messaging

---

### TC-CROSS-003: Expired Card with Valid Other Fields
**Objective:** Verify expiration date validation is independent

**Priority:** High  
**Type:** Validation  

**Test Data:**
- Card Number: `4622943127013705` ✅
- Cardholder Name: `John Smith` ✅
- Expiration: `01/2020` ❌ (expired)
- CVV: `838` ✅

**Steps:**
1. Enter valid data except expired date
2. Submit

**Expected Results:**
- ✅ Error for expired date only
- ✅ Other fields remain valid
- ✅ "Card is expired" or similar message
- ✅ Cannot proceed

---

## 6. SECURITY & PCI COMPLIANCE TESTS

### TC-SEC-001: Card Number Iframe Isolation
**Objective:** Verify card number is in secure iframe (PCI requirement)

**Priority:** Critical  
**Type:** Security  

**Steps:**
1. Inspect card number field in browser DevTools
2. Verify iframe implementation
3. Attempt to access value via JavaScript console

**Expected Results:**
- ✅ Card number hosted in CyberSource iframe
- ✅ Parent page cannot access value
- ✅ Iframe from `testflex.cybersource.com` domain
- ✅ Cross-origin security enforced

**Test Command:**
```javascript
// Should fail with cross-origin error
document.querySelector('iframe').contentDocument.querySelector('input').value
```

---

### TC-SEC-002: CVV Iframe Isolation
**Objective:** Verify CVV is in secure iframe (PCI requirement)

**Priority:** Critical  
**Type:** Security  

**Steps:**
1. Inspect CVV field in DevTools
2. Verify iframe implementation
3. Attempt to access CVV via JavaScript

**Expected Results:**
- ✅ CVV hosted in CyberSource iframe
- ✅ Parent page cannot access value
- ✅ Proper iframe sandboxing
- ✅ Security policy enforced

---

### TC-SEC-003: CVV Masking Verification
**Objective:** Verify CVV is visually masked

**Priority:** High  
**Type:** Security  

**Steps:**
1. Enter CVV: 838
2. Observe field display
3. Look over shoulder (social engineering test)

**Expected Results:**
- ✅ CVV displayed as bullets (•••) or asterisks
- ✅ Actual digits not visible
- ✅ Cannot shoulder-surf CVV
- ✅ Security best practice followed

---

### TC-SEC-004: No Sensitive Data in Network Requests
**Objective:** Verify card data not sent in clear text

**Priority:** Critical  
**Type:** Security  

**Steps:**
1. Open browser DevTools Network tab
2. Fill form with card data
3. Submit order
4. Inspect network requests for sensitive data

**Expected Results:**
- ✅ Raw card number NOT in request payload
- ✅ CVV NOT in request payload
- ✅ Only tokenized/encrypted data sent
- ✅ CyberSource handles tokenization
- ✅ HTTPS enforced

---

### TC-SEC-005: No Sensitive Data in Browser Storage
**Objective:** Verify card data not stored in browser (localStorage, sessionStorage)

**Priority:** Critical  
**Type:** Security  

**Steps:**
1. Fill form with card data
2. Submit order
3. Check browser storage in DevTools:
   - localStorage
   - sessionStorage
   - cookies

**Expected Results:**
- ✅ No raw card number in storage
- ✅ No CVV in storage
- ✅ Only safe data persisted (if any)
- ✅ Security best practices followed

---

### TC-SEC-006: HTTPS Enforcement
**Objective:** Verify all communication over HTTPS

**Priority:** Critical  
**Type:** Security  

**Steps:**
1. Check page URL protocol
2. Verify iframe sources
3. Check all network requests

**Expected Results:**
- ✅ Main page: https://
- ✅ CyberSource iframes: https://
- ✅ All API calls: https://
- ✅ No mixed content warnings
- ✅ Secure connection enforced

---

## 7. ERROR HANDLING & RECOVERY TESTS

### TC-ERR-001: Network Failure During Form Display
**Objective:** Verify graceful handling if CyberSource microform fails to load

**Priority:** High  
**Type:** Error Handling  

**Steps:**
1. Simulate network interruption (throttle or block testflex.cybersource.com)
2. Select Bank card (CyberSource)
3. Observe behavior

**Expected Results:**
- ✅ Appropriate error message shown
- ✅ User informed of issue
- ✅ No blank/broken form
- ✅ Retry option available OR
- ✅ Fallback to different payment method suggested

---

### TC-ERR-002: Payment Gateway Timeout
**Objective:** Verify handling of slow CyberSource API responses

**Priority:** Medium  
**Type:** Error Handling  

**Steps:**
1. Fill valid card data
2. Submit order
3. Simulate slow network (if possible)

**Expected Results:**
- ✅ Loading indicator shown
- ✅ User informed payment is processing
- ✅ Timeout after reasonable duration (30-60 seconds)
- ✅ Error message if timeout occurs
- ✅ User can retry

---

### TC-ERR-003: Invalid API Response
**Objective:** Verify handling of malformed CyberSource API responses

**Priority:** Medium  
**Type:** Error Handling  

**Steps:**
1. Fill valid card data
2. Submit (if API can return error in test environment)
3. Observe error handling

**Expected Results:**
- ✅ Error caught and handled
- ✅ User-friendly error message
- ✅ No application crash
- ✅ Technical error logged to console
- ✅ User can retry or change payment method

---

### TC-ERR-004: Session Timeout During Checkout
**Objective:** Verify handling of session expiration

**Priority:** Medium  
**Type:** Error Handling  

**Steps:**
1. Start filling credit card form
2. Wait for session timeout (or simulate)
3. Attempt to submit order

**Expected Results:**
- ✅ User prompted to log in again
- ✅ Cart data preserved (if possible)
- ✅ Form data preserved (if possible)
- ✅ Security maintained
- ✅ Clear messaging

---

## 8. USABILITY & UX TESTS

### TC-UX-001: Field Labels and Placeholders
**Objective:** Verify all fields have clear labels and helpful placeholders

**Priority:** Medium  
**Type:** Usability  

**Steps:**
1. Display CyberSource form
2. Review all field labels
3. Check placeholder text

**Expected Results:**
- ✅ Card Number label: "Card number*"
- ✅ Card Number placeholder: "1111 1111 1111 1111"
- ✅ Cardholder Name label: "Cardholder name*"
- ✅ Expiration label: "Expiration date*"
- ✅ Expiration placeholder: "MM / YYYY"
- ✅ CVV label: "Security code*"
- ✅ CVV placeholder: "•••"
- ✅ All text clear and professional

---

### TC-UX-002: Card Type Icons Visibility
**Objective:** Verify card type icons enhance user experience

**Priority:** Low  
**Type:** Usability  

**Steps:**
1. Observe card type icons when form loads
2. Enter different card types (if multiple test cards available)

**Expected Results:**
- ✅ Icons visible: Visa, Mastercard, Maestro, Amex
- ✅ Icons well-designed and recognizable
- ✅ Active/inactive states clear
- ✅ Icons help user identify accepted cards

---

### TC-UX-003: Error Message Clarity
**Objective:** Verify error messages are helpful and actionable

**Priority:** High  
**Type:** Usability  

**Steps:**
1. Trigger various validation errors
2. Read error messages
3. Assess clarity and helpfulness

**Expected Results:**
- ✅ Errors clearly state the problem
- ✅ Errors suggest how to fix
- ✅ No technical jargon
- ✅ User can easily understand and resolve
- ✅ Error location obvious (field highlighted)

---

### TC-UX-004: Tab Order and Keyboard Navigation
**Objective:** Verify logical tab order through form fields

**Priority:** Medium  
**Type:** Usability  

**Steps:**
1. Click in card number field
2. Press Tab key repeatedly
3. Observe tab order

**Expected Results:**
- ✅ Tab order: Card Number → Cardholder Name → Expiration Date → CVV
- ✅ Logical flow
- ✅ Can navigate entire form via keyboard
- ✅ No tab traps
- ✅ Tab into and out of iframes works

---

## 9. PERFORMANCE TESTS

### TC-PERF-001: Form Load Time
**Objective:** Verify CyberSource form loads quickly

**Priority:** Medium  
**Type:** Performance  

**Steps:**
1. Select Bank card (CyberSource)
2. Measure time until form fully displayed
3. Check if iframes load promptly

**Expected Results:**
- ✅ Form displays within 1-2 seconds
- ✅ No noticeable delay
- ✅ Iframes load smoothly
- ✅ Good user experience

---

### TC-PERF-002: Field Input Responsiveness
**Objective:** Verify form fields respond immediately to input

**Priority:** Medium  
**Type:** Performance  

**Steps:**
1. Type rapidly in each field
2. Observe response time

**Expected Results:**
- ✅ No lag or delay
- ✅ Characters appear immediately
- ✅ Auto-formatting doesn't slow input
- ✅ Smooth typing experience

---

## 10. INTEGRATION TESTS

### TC-INT-001: CyberSource Microform Loading
**Objective:** Verify CyberSource Flex microform loads correctly

**Priority:** Critical  
**Type:** Integration  

**Steps:**
1. Monitor Network tab
2. Select Bank card (CyberSource)
3. Observe CyberSource resources loading

**Expected Results:**
- ✅ `flex-microform.min.js` loads [200 OK]
- ✅ `iframe.min.js` loads [200 OK]
- ✅ `iframe.html` loads [200 OK]
- ✅ Resources from `testflex.cybersource.com`
- ✅ No 404 or network errors

---

### TC-INT-002: JWT Token Generation
**Objective:** Verify secure token-based iframe communication

**Priority:** High  
**Type:** Integration  

**Steps:**
1. Select CyberSource payment
2. Inspect iframe source URLs
3. Check for JWT token in URL

**Expected Results:**
- ✅ JWT token present in iframe URL
- ✅ Token format valid (three parts separated by dots)
- ✅ Dynamic token (changes each session)
- ✅ Secure authentication

---

### TC-INT-003: Payment Processing Component Load
**Objective:** Verify CyberSource Vue component loads

**Priority:** High  
**Type:** Integration  

**Steps:**
1. Monitor Network tab for Vue component
2. Select CyberSource payment
3. Check if component loads

**Expected Results:**
- ✅ `payment-processing-cyber-source.vue` loads [200 OK]
- ✅ Component initializes correctly
- ✅ No Vue errors in console
- ✅ Form bindings working

---

## 11. REGRESSION TESTS

### TC-REG-001: Other Payment Methods Still Work
**Objective:** Verify CyberSource doesn't break other payment methods

**Priority:** High  
**Type:** Regression  

**Steps:**
1. Test Manual payment method
2. Test other bank card methods (if available)
3. Verify all still functional

**Expected Results:**
- ✅ Other payment methods unaffected
- ✅ Can switch between methods
- ✅ No conflicts
- ✅ Each method works independently

---

### TC-REG-002: Cart Functionality Unchanged
**Objective:** Verify cart operations still work with CyberSource

**Priority:** Medium  
**Type:** Regression  

**Steps:**
1. Add/remove items from cart
2. Update quantities
3. Select CyberSource payment
4. Verify cart updates reflected

**Expected Results:**
- ✅ Cart operations work normally
- ✅ Totals update correctly
- ✅ CyberSource form reflects current cart
- ✅ No interference

---

### TC-REG-003: Shipping Method Changes
**Objective:** Verify changing shipping doesn't break CyberSource form

**Priority:** Medium  
**Type:** Regression  

**Steps:**
1. Select CyberSource payment
2. Fill partial form data
3. Change shipping method (Ground → Air → Pickup)
4. Verify form state

**Expected Results:**
- ✅ Form remains displayed
- ✅ Form data persists or resets appropriately
- ✅ No form breakage
- ✅ Iframes remain functional

---

## 12. BROWSER-SPECIFIC TESTS

### TC-BROWSER-001: Chrome - Autofill Integration
**Objective:** Verify Chrome autofill works with CyberSource form

**Priority:** Low  
**Type:** Browser-Specific  

**Steps:**
1. Save payment method in Chrome
2. Return to checkout
3. Observe autofill suggestions

**Expected Results:**
- ✅ Chrome offers autofill OR
- ✅ Autofill disabled for security (acceptable)
- ✅ No conflicts with iframe fields
- ✅ Cardholder name/expiry can autofill (if enabled)

---

### TC-BROWSER-002: WebKit - Safari-Specific Behavior
**Objective:** Verify no Safari/WebKit-specific issues

**Priority:** High  
**Type:** Browser-Specific  

**Steps:**
1. Test complete flow in WebKit/Safari
2. Verify iframe rendering
3. Check for rendering quirks

**Expected Results:**
- ✅ Identical to Chrome behavior
- ✅ No WebKit rendering bugs
- ✅ Iframes load correctly
- ✅ No Safari-specific CSS issues

---

## 13. ACCESSIBILITY TESTS

### TC-ACC-001: Screen Reader Compatibility
**Objective:** Verify form is accessible to screen readers

**Priority:** Medium  
**Type:** Accessibility  

**Steps:**
1. Enable screen reader (NVDA, JAWS, VoiceOver)
2. Navigate through form
3. Verify field announcements

**Expected Results:**
- ✅ Field labels announced
- ✅ Required fields indicated
- ✅ Error messages readable
- ✅ Logical navigation order
- ✅ ARIA labels present

---

### TC-ACC-002: Keyboard-Only Navigation
**Objective:** Verify form fully operable via keyboard

**Priority:** Medium  
**Type:** Accessibility  

**Steps:**
1. Navigate entire form using only keyboard (Tab, Shift+Tab, Enter)
2. Fill all fields
3. Submit form

**Expected Results:**
- ✅ Can reach all fields via keyboard
- ✅ Tab order logical
- ✅ Enter key submits form
- ✅ No mouse required
- ✅ WCAG 2.1 compliance

---

### TC-ACC-003: Sufficient Color Contrast
**Objective:** Verify text/background contrast meets WCAG standards

**Priority:** Low  
**Type:** Accessibility  

**Steps:**
1. Inspect field labels, error messages
2. Use contrast checker tool
3. Verify readability

**Expected Results:**
- ✅ Contrast ratio ≥ 4.5:1 for normal text
- ✅ Contrast ratio ≥ 3:1 for large text
- ✅ Error text easily readable
- ✅ WCAG AA compliance

---

## Test Execution Priority

### Must Execute (P0 - Critical)
- TC-POS-001: Complete valid form submission
- TC-NEG-001: Invalid card number
- TC-NEG-004: Expired card
- TC-CROSS-001: All fields empty
- TC-SEC-001: Card number iframe isolation
- TC-SEC-002: CVV iframe isolation
- TC-VAL-001: Luhn algorithm validation

### Should Execute (P1 - High)
- All remaining negative tests (TC-NEG-002 through TC-NEG-013)
- Edge cases TC-EDGE-001, 003, 012, 017, 020
- Cross-field validation tests
- Integration tests
- Browser-specific tests

### Nice to Have (P2 - Medium/Low)
- Remaining edge cases
- Performance tests
- Accessibility tests
- Usability tests

---

## Test Data Summary

### Valid Test Data (from orderCreationMatrix.txt)
**CyberSource:**
- Card: `4622943127013705`
- CVV: `838`
- Expiry: `09/2029`
- Name: Any valid name (e.g., "John Smith")

### Invalid Test Data Examples
- Invalid Card: `1234567890123456`
- Expired Date: `01/2020`
- Invalid CVV: `12` (too short), `12345` (too long)
- Invalid Name: `123456`, `!!!`, (empty)

---

## Expected Outcomes

### Success Metrics
- ✅ 100% of positive tests pass
- ✅ 100% of negative tests properly reject invalid data
- ✅ All security tests confirm PCI compliance
- ✅ Cross-browser compatibility maintained
- ✅ No critical bugs found

### Acceptance Criteria
- ✅ Form displays correctly
- ✅ Valid data accepted
- ✅ Invalid data rejected with clear errors
- ✅ Security standards met
- ✅ User experience is smooth

---

## Notes

### Iframe Security Limitation
- Card Number and CVV fields are in CyberSource secure iframes
- **Cannot be filled programmatically** for security reasons
- Manual testing required for complete execution
- This is **correct and expected behavior** for PCI compliance

### Testing Approach
1. **Automated:** Form display, field presence, non-secure field input
2. **Manual:** Secure iframe field data entry, complete order flow
3. **Combined:** Validation messages, error handling, integration verification

---

**Total Test Cases:** 50+  
**Critical Tests:** 15  
**High Priority Tests:** 18  
**Medium/Low Priority:** 17+

---

**Document Created:** December 9, 2025  
**For Story:** VCST-3387  
**Payment Provider:** CyberSource  
**Status:** Ready for execution

---

