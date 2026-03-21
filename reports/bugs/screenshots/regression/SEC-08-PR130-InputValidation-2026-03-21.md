# Security Suite 08 - PR #130 InputValidationOptions Test Report

**Date:** 2026-03-21
**Environment:** QA (https://vcst-qa-storefront.govirto.com) v2.44.0-alpha.2262
**Browser:** playwright-firefox
**Test Account:** qa-agent-slot2@virtocommerce.com ("Agent Firefox")
**Scope:** UPDATED and NEW test cases from PR #130 vc-module-profile-experience-api (InputValidationOptions)

---

## Summary

| Case ID | Title | Result | Severity |
|---------|-------|--------|----------|
| SEC-INPUT-002 | XSS Prevention in Forms (Profile First Name) | **PASS** | High |
| SEC-XSS-004 | Stored XSS via Profile Display Name (SVG onload) | **PASS** | High |
| SEC-VALIDATION-001 | Server-Side Name Field Validation (NameValidationPattern) | **PASS** | Critical |
| SEC-XSS-001 | XSS Prevention in Address Field During Checkout | **FAIL** | Critical |
| SEC-VALIDATION-002 | Script Injection in Free-Text Fields (EnableScriptInjectionValidation) | **BLOCKED** | Critical |

**Pass Rate:** 3/5 (60%) -- below 85% threshold; 1 FAIL, 1 BLOCKED

---

## Detailed Results

### SEC-INPUT-002: XSS Prevention in Forms -- PASS

**Objective:** Verify server rejects `<script>alert('XSS')</script>` in First Name field via NameValidationPattern.

**Steps executed:**
1. Navigated to /account/profile (user already logged in)
2. Entered `<script>alert('XSS')</script>` in First Name field
3. Clicked Update button
4. Server returned error -- profile NOT updated

**Observations:**
- Server rejected the XSS payload as expected
- Error message shown: "Something went wrong. Please try again later." (generic, not validation-specific)
- Profile name remained unchanged after rejection
- No JavaScript alert dialog appeared

**UX Note:** Error message is generic rather than informing the user which characters are invalid. Consider showing: "Name contains invalid characters. Only letters, spaces, apostrophes, hyphens, and dots are allowed."

---

### SEC-XSS-004: Stored XSS via Profile Display Name -- PASS

**Objective:** Verify server rejects `<svg onload=alert('xss')>` in First Name via NameValidationPattern.

**Steps executed:**
1. Navigated to /account/profile
2. Entered `<svg onload=alert('xss')>` in First Name field
3. Clicked Update button
4. Server returned error -- profile NOT updated

**Observations:**
- Server rejected the SVG XSS payload as expected
- Same generic error message: "Something went wrong. Please try again later."
- Profile name remained unchanged
- No SVG onload handler executed

---

### SEC-VALIDATION-001: Server-Side Name Field Validation -- PASS

**Objective:** Verify NameValidationPattern regex `^[\p{L}\p{M}\s'\-\.]+$` accepts valid Unicode names and rejects invalid ones.

**Sub-tests:**

| # | Input | Expected | Actual | Result |
|---|-------|----------|--------|--------|
| 1 | `O'Brien-Muller` (valid Unicode) | Accepted | Accepted -- profile updated successfully | PASS |
| 2 | `Name<tag>` | Rejected | Rejected -- server error, profile unchanged | PASS |
| 3 | `Name123` | Rejected | Rejected -- server error, profile unchanged | PASS |
| 4 | `Name@domain` | Rejected | Rejected -- server error, profile unchanged | PASS |

**Cleanup:** Profile name restored to "Agent" after testing.

---

### SEC-XSS-001: XSS Prevention in Address Field During Checkout -- FAIL

**Objective:** Verify server rejects `<script>alert('xss')</script>` in Street Address field via EnableNoHtmlTagsValidation.

**Steps executed:**
1. Added UNTUCKit eGift Card to cart
2. Navigated to /cart (checkout page)
3. Opened "Edit address" dialog for shipping address
4. Entered `<script>alert('xss')</script>` in Address field
5. Filled Email field (required for Save to enable)
6. Clicked Save

**ACTUAL RESULT:** Address was SAVED SUCCESSFULLY with the XSS payload. The dialog closed normally. The shipping address displayed: `<script>alert('xss')</script>, Los Angeles, California, 90001, United States of America`. The billing address (same as shipping) also displayed the XSS payload.

**Expected Result:** Server should reject -- EnableNoHtmlTagsValidation should reject HTML tags in address fields. Address should NOT be saved.

**Evidence:**
- Screenshot: `SEC-XSS-001-xss-payload-in-address.png` (payload in form before save)
- Screenshot: `SEC-XSS-001-FAIL-address-saved-with-xss.png` (payload persisted after save)
- Network: All GraphQL requests returned HTTP 200 with no errors
- Console: 0 errors

**Root Cause Assessment:** EnableNoHtmlTagsValidation appears to NOT be applied to address field mutations (addOrUpdateCartShipment / changeCartItemSelectedAddress). The validation may only be configured for profile/contact mutations but not for cart address updates.

**Severity:** Critical (P0) -- XSS payload can be stored in address fields used during checkout. While the script tag is rendered as text (not executed) in the storefront, the stored payload could be executed in other contexts (admin panel, order emails, API responses without proper output encoding).

**Cleanup:** Address restored to "200 QA Lane" after testing.

---

### SEC-VALIDATION-002: Script Injection in Free-Text Fields -- BLOCKED

**Objective:** Verify EnableScriptInjectionValidation rejects `<script>`, `javascript:`, `data:text/html` in About/description field.

**Blocking Reason:** The storefront profile page (`/account/profile`) does not have an "About" or "description" free-text field. Available profile fields are: First Name, Last Name, Email (disabled), Default Language, Default Currency. There is no free-text description field exposed on the current B2B storefront for this account type.

**Supplementary Finding:** Tested the Order Comment field on the cart page as an alternative free-text field. Entered `<script>alert(1)</script>` in the Order Comment field. After page reload, the payload was persisted in the comment field (25 / 1000 characters). No validation error was shown. This suggests EnableScriptInjectionValidation is NOT applied to cart comment mutations either.

**Recommendation:**
1. The test case needs to be updated to specify which free-text field is available in the storefront, or the "About" field needs to be added to the profile page.
2. Investigate whether EnableScriptInjectionValidation is configured but not applied to cart/order comment mutations.

---

## Cross-Cutting Findings

### Finding 1: Generic Error Messages (UX Concern -- Medium)
All rejected profile mutations show "Something went wrong. Please try again later." instead of specific validation errors. This generic message:
- Does not tell the user what is wrong with their input
- Could be confused with a server error
- Does not guide the user to correct their input

**Recommendation:** Return field-specific validation messages, e.g., "First name contains invalid characters."

### Finding 2: Validation Gap -- Address Fields Not Protected (Security -- Critical)
EnableNoHtmlTagsValidation does not appear to be enforced on checkout address mutations. HTML tags including `<script>` can be stored in address fields. This is a stored XSS risk if the address is rendered without output encoding in:
- Admin panel (order details)
- Email notifications (order confirmation, shipping notification)
- API responses consumed by third-party integrations

### Finding 3: Validation Gap -- Cart Comment Not Protected (Security -- High)
`<script>alert(1)</script>` was accepted and persisted in the Order Comment field. EnableScriptInjectionValidation does not appear to cover cart/order comment mutations.

---

## Cleanup Status

| Item | Status |
|------|--------|
| Profile name restored to "Agent" | Done |
| Address restored to "200 QA Lane" | Done |
| Order comment cleared | Done |
| Cart item removed | Done |

---

## Verdict

**GO/NO-GO: NO-GO** for PR #130 InputValidationOptions as currently deployed.

- NameValidationPattern works correctly for profile name fields (SEC-INPUT-002, SEC-XSS-004, SEC-VALIDATION-001 all PASS)
- EnableNoHtmlTagsValidation is NOT enforced on address fields (SEC-XSS-001 FAIL -- P0)
- EnableScriptInjectionValidation cannot be verified on profile (no About field) and does not appear to cover cart comments

**Action Required:**
1. [P0] Fix EnableNoHtmlTagsValidation to cover address mutations in checkout flow
2. [P1] Add EnableScriptInjectionValidation to cart/order comment mutations
3. [P2] Improve error messages to show field-specific validation feedback
4. [P2] Update SEC-VALIDATION-002 test case to reference an available free-text field, or add About field to profile
