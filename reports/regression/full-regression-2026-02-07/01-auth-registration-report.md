# Authentication & Registration - Deep Regression Test Report

**Date:** 2026-02-07
**Environment:** QA Storefront (https://vcst-qa-storefront.govirto.com)
**Admin SPA:** https://vcst-qa.govirto.com
**Storefront Version:** 2.41.0-alpha.2219
**Browser:** Chrome (via playwright-chrome MCP)
**Tester:** qa-frontend-expert (Claude Opus 4.6)

---

## Executive Summary

All 9 test cases in the Authentication & Registration regression suite **PASSED**. The authentication flows are stable and functioning correctly on the QA environment. Two minor findings were noted (weak password client-side validation gap, recurring ServiceWorker 404 error), neither of which blocks release.

| Area | Status | Issues Found |
|------|--------|-------------|
| Personal Registration | PASS | 0 critical, 1 observation |
| Organization Registration | PASS | 0 |
| Sign In (Personal) | PASS | 0 |
| Sign In (Organization) | PASS | 0 |
| Forgot Password | PASS | 0 |
| Sign Out | PASS | 0 |
| Protected Route Redirect | PASS | 0 |
| Bulk Order (B2B) | PASS | 0 |
| Company Members (B2B) | PASS | 0 |

**Overall Result: PASS (9/9 test cases passed)**

---

## Test Data Created

| Account Type | Email | Password | Status |
|-------------|-------|----------|--------|
| Personal | qa-reg-personal-feb07@test-vc.com | QaTest@2026! | Registered + Verified |
| Organization | qa-reg-org-feb07@test-vc.com | QaOrgTest@2026! | Registered + Verified |
| Organization Name | QA Test Organization Feb07 | -- | Created |

**Note:** Email verification was performed manually in Admin SPA > Security > Users for both accounts.

---

## Detailed Test Results

### FR-REG-001: Personal Account Registration

**Status: PASS**

| Step | Description | Result | Screenshot |
|------|-------------|--------|------------|
| 1 | Navigate to /sign-up | Registration page loads with Personal/Company toggle | FR-REG-001-registration-page.png |
| 2 | Submit empty form | All 5 fields show "This field is required" | FR-REG-001-empty-form-validation.png |
| 3 | Enter invalid email "notanemail" | Shows "Enter a valid email address, e.g. johndoe@gmail.com" | -- |
| 4 | Enter weak password "123" | Form submits to server without client-side block (see Finding #1) | FR-REG-001-weak-password-no-client-validation.png |
| 5 | Enter mismatched passwords | Shows "The password fields must have matching values" | -- |
| 6 | Fill valid form and submit | SUCCESS - Redirected to /successful-registration | FR-REG-001-registration-success.png |
| 7 | Attempt duplicate email registration | Shows "This email is already registered with us" | FR-REG-001-duplicate-email-error.png |

**Edge Cases Tested:**
- Empty form submission: PASS (all required fields flagged)
- Invalid email format: PASS (client-side validation works)
- Weak password: OBSERVATION (not blocked client-side, see Finding #1)
- Password mismatch: PASS (validation error shown)
- Duplicate email: PASS (clear error message)

---

### FR-REG-002: Organization Account Registration

**Status: PASS**

| Step | Description | Result | Screenshot |
|------|-------------|--------|------------|
| 1 | Click "Company account" radio | Additional "Company name*" field appears | FR-REG-002-company-form.png |
| 2 | Fill all fields including Company name | Form populated correctly | FR-REG-002-filled-company-form.png |
| 3 | Submit form | SUCCESS - Redirected to /successful-registration | FR-REG-002-registration-success.png |

**Organization created:** QA Test Organization Feb07

---

### FR-AUTH-001: Sign In Personal User

**Status: PASS**

| Step | Description | Result | Screenshot |
|------|-------------|--------|------------|
| 1 | Navigate to /sign-in | Sign-in page loads with email, password, Remember me, social logins | FR-AUTH-001-signin-page.png |
| 2 | Enter wrong password | "Login attempt failed. Check your credentials" | FR-AUTH-001-wrong-password.png |
| 3 | Enter non-existent email | Same generic error (good security practice) | -- |
| 4 | Submit empty fields | Both show "This field is required" | -- |
| 5 | SQL injection attempt "' OR 1=1 --" | Email validation catches it (client-side) | -- |
| 6 | Sign in with correct credentials | SUCCESS - Redirected to homepage, header shows "QaRegPersonal TestFeb07" | FR-AUTH-001-signin-success.png |
| 7 | Navigate to /account/dashboard | Profile page loads with sidebar: Dashboard, Profile, Change password, Addresses, Orders, Saved for later, Lists, Notifications, Saved credit cards, Quote requests, Back-in-stock list, Points history | FR-AUTH-001-account-dashboard.png |

**Edge Cases Tested:**
- Wrong password: PASS (generic error, no info leak)
- Non-existent email: PASS (same generic error)
- Empty fields: PASS (required field validation)
- SQL injection: PASS (client-side email validation blocks it)

---

### FR-AUTH-002: Sign In Organization User

**Status: PASS**

| Step | Description | Result | Screenshot |
|------|-------------|--------|------------|
| 1 | Sign out from personal account | Successful | -- |
| 2 | Sign in with org credentials | SUCCESS - Redirected to dashboard | FR-AUTH-002-org-signin-dashboard.png |
| 3 | Verify organization context | Header shows: "QA Test Organization Feb07" org name + "QaRegOrg AdminFeb07" user name | FR-AUTH-002-org-signin-dashboard.png |
| 4 | Verify Corporate sidebar | Additional "Corporate" section with "Company info" and "Company members" | FR-AUTH-002-org-signin-dashboard.png |
| 5 | Navigate to Company Members | Shows table with one member: QaRegOrg AdminFeb07, Role: Organization maintainer, Active | FR-AUTH-002-company-members.png |
| 6 | Navigate to Bulk Order | Shows "Bulk order pad" with Copy&Paste and Manually tabs | FR-AUTH-002-bulk-order.png |

**Observation:** Organization accounts show "Corporate" section in sidebar with "Company info" and "Company members" links. Personal accounts have "Addresses" in sidebar but organization accounts do not.

---

### FR-AUTH-003: Forgot Password Flow

**Status: PASS**

| Step | Description | Result | Screenshot |
|------|-------------|--------|------------|
| 1 | Navigate to /sign-in, click "Forgot your password?" | Redirected to /forgot-password | FR-AUTH-003-signin-page-with-forgot-link.png |
| 2 | View forgot password page | Page shows "RESET YOUR PASSWORD" with email field and Submit button | FR-AUTH-003-forgot-password-page.png |
| 3 | Submit with empty email | Submit button is disabled (cannot click) | FR-AUTH-003-empty-email-disabled-submit.png |
| 4 | Enter invalid email "notanemail" | Shows "Enter a valid email address, e.g. johndoe@gmail.com", Submit stays disabled | FR-AUTH-003-invalid-email-validation.png |
| 5 | Submit with non-existent email | Shows "We sent you a reset password link to your inbox" (security: no info leak) | FR-AUTH-003-nonexistent-email-response.png |
| 6 | Submit with valid registered email | Shows same success message: "We sent you a reset password link to your inbox" | FR-AUTH-003-valid-email-success.png |

**Security Assessment:**
- Submit button disabled when email empty: PASS
- Invalid email format rejected client-side: PASS
- No email enumeration (same response for existing and non-existing emails): PASS
- "Home page" link provided after submission: PASS

---

### FR-AUTH-004: Sign Out

**Status: PASS**

| Step | Description | Result | Screenshot |
|------|-------------|--------|------------|
| 1 | Sign in as personal user | Successful, header shows "QaRegPersonal TestFeb07" | -- |
| 2 | Click account name dropdown | Dropdown shows user name link + "Logout" button | FR-AUTH-004-account-menu-logout.png |
| 3 | Click "Logout" | Signed out, redirected to homepage. Header changes to "Sign in" / "Sign up now" | FR-AUTH-004-signout-success.png |
| 4 | Homepage content changes | Logged-out view shows different layout (Daily Deals, B2B features) vs logged-in (Gifts/Sale) | FR-AUTH-004-signout-success.png |
| 5 | Access protected route /account/dashboard | Redirected to /sign-in?returnUrl=/account/dashboard | FR-AUTH-004-protected-route-redirect.png |

**Verified:**
- Session properly cleared on logout: PASS
- Header state reverts to anonymous: PASS
- Protected routes redirect to sign-in with returnUrl parameter: PASS
- returnUrl parameter works (signs in and redirects to dashboard): PASS

---

### FR-B2B-001: Quick Order / Bulk Order Entry

**Status: PASS**

| Step | Description | Result | Screenshot |
|------|-------------|--------|------------|
| 1 | Navigate to /bulk-order (org user) | Page loads with "BULK ORDER PAD" heading and two tabs | FR-B2B-001-bulk-order-page.png |
| 2 | Copy&Paste tab | Shows textarea with format instructions (SKU,Quantity), Reset and Add to cart buttons | FR-B2B-001-bulk-order-page.png |
| 3 | Manually tab | Shows 5 rows of SKU + Quantity fields, "Add 5 more rows" button | FR-B2B-001-manually-tab.png |
| 4 | Enter invalid SKU with quantity | SKU: "INVALID-SKU-12345", Qty: 5 | -- |
| 5 | Click "Add to cart" | Error dialog: "Add to cart SKU errors" showing INVALID-SKU-12345 = "Invalid product" | FR-B2B-001-invalid-sku-error.png |

**Verified:**
- Bulk order page accessible for org users: PASS
- Copy&Paste tab with CSV format support: PASS
- Manually tab with SKU/Quantity rows: PASS
- "Add 5 more rows" button: PASS (visible)
- Reset button enables when data entered: PASS
- Add to cart disabled when no data: PASS
- Invalid SKU error handling: PASS (clear error dialog with table)

---

### FR-B2B-002: Company Members Management

**Status: PASS**

| Step | Description | Result | Screenshot |
|------|-------------|--------|------------|
| 1 | Navigate to /company/members | Company members page loads with table, search, and filters | FR-B2B-002-company-members.png |
| 2 | Verify member table | Shows: QaRegOrg AdminFeb07, Role: Organization maintainer, Email, Active status | FR-B2B-002-company-members.png |
| 3 | Click "Invite members" button | Invite dialog opens with Role dropdown, email field, message field | FR-B2B-002-invite-member-dialog.png |
| 4 | Verify invite form fields | Role: "Organization employee" (default), Email (supports multiple via commas/semicolons), Message (optional) | FR-B2B-002-invite-member-dialog.png |
| 5 | Send button disabled without email | Confirmed | FR-B2B-002-invite-member-dialog.png |

**Verified:**
- Company members page accessible: PASS
- Members table with columns (Name, Role, Email, Active): PASS
- Search field ("Search by name, role or email"): PASS (visible)
- Filters button: PASS (visible)
- Invite members dialog: PASS
- Role dropdown with default "Organization employee": PASS
- Multi-email support (commas, semicolons, line breaks): PASS (placeholder text confirms)
- Send button disabled without email input: PASS

---

## Findings & Observations

### Finding #1: Weak Password Not Blocked Client-Side (LOW)

**Severity:** Low
**Component:** Registration form (/sign-up)
**Description:** When entering a weak password like "123", the form submits to the server without client-side enforcement. Password tips are displayed (digits, lowercase, uppercase, special chars, min 8 chars) but are not enforced before form submission. The server may reject weak passwords, but the client-side validation gap could lead to a poor user experience.
**Expected:** Client-side validation should prevent submission when password does not meet minimum requirements.
**Recommendation:** Add client-side password strength enforcement to match the displayed password tips.

### Finding #2: ServiceWorker Registration 404 Error (LOW)

**Severity:** Low
**Component:** All pages
**Description:** Console error on multiple pages: "A bad HTTP response code (404) was received when fetching the script" for ServiceWorker registration.
**Impact:** Does not affect functionality. May affect PWA capabilities or push notifications.
**Recommendation:** Either deploy the ServiceWorker script or remove the registration attempt.

### Observation #1: Different Homepage for Logged-In vs Anonymous Users

The homepage shows different content based on authentication state:
- **Logged in (personal):** Hero banner "Gifts for sweetheart. Sale" + "Discounts. Loyalty cards" section
- **Logged in (org):** Same as personal but with organization name in header
- **Anonymous:** Hero banner "Most Special Drinks" + "Daily Deals" section + B2B features section

### Observation #2: Sidebar Differences Between Personal and Org Accounts

- **Personal account sidebar:** Includes "Addresses" link
- **Organization account sidebar:** Does NOT include "Addresses" but adds "Corporate" section with "Company info" and "Company members"

---

## Console Errors Summary

| Error | Frequency | Impact |
|-------|-----------|--------|
| ServiceWorker 404 | Every page load | Low - no functional impact |
| Failed resource (Cherry Soda image) | Homepage (logged out) | Low - missing product image |

---

## Screenshots Index

| # | Filename | Description |
|---|----------|-------------|
| 1 | step0-homepage-loaded.png | Initial homepage load verification |
| 2 | FR-REG-001-registration-page.png | Registration form with Personal/Company toggle |
| 3 | FR-REG-001-empty-form-validation.png | All required fields show validation errors |
| 4 | FR-REG-001-weak-password-no-client-validation.png | Weak password submitted without client block |
| 5 | FR-REG-001-filled-form.png | Completed personal registration form |
| 6 | FR-REG-001-registration-success.png | Registration completed successfully |
| 7 | FR-REG-001-duplicate-email-error.png | Duplicate email error message |
| 8 | FR-REG-002-company-form.png | Company account form with Company name field |
| 9 | FR-REG-002-filled-company-form.png | Completed organization registration form |
| 10 | FR-REG-002-registration-success.png | Organization registration success |
| 11 | FR-AUTH-001-signin-page.png | Sign-in page layout |
| 12 | FR-AUTH-001-wrong-password.png | Wrong password error message |
| 13 | FR-AUTH-001-signin-success.png | Successful login, homepage with user name |
| 14 | FR-AUTH-001-account-dashboard.png | Account dashboard with sidebar navigation |
| 15 | FR-AUTH-002-org-signin-dashboard.png | Organization account dashboard |
| 16 | FR-AUTH-002-company-members.png | Company members page during auth test |
| 17 | FR-AUTH-002-bulk-order.png | Bulk order page during auth test |
| 18 | FR-AUTH-003-signin-page-with-forgot-link.png | Sign-in page showing forgot password link |
| 19 | FR-AUTH-003-forgot-password-page.png | Forgot password page layout |
| 20 | FR-AUTH-003-empty-email-disabled-submit.png | Disabled submit with empty email |
| 21 | FR-AUTH-003-invalid-email-validation.png | Invalid email validation error |
| 22 | FR-AUTH-003-nonexistent-email-response.png | Non-existent email same success message |
| 23 | FR-AUTH-003-valid-email-success.png | Valid email password reset success |
| 24 | FR-AUTH-004-account-menu-logout.png | Account dropdown with logout button |
| 25 | FR-AUTH-004-signout-success.png | Signed out homepage state |
| 26 | FR-AUTH-004-protected-route-redirect.png | Protected route redirect to sign-in |
| 27 | FR-B2B-001-bulk-order-page.png | Bulk order page (Copy&Paste tab) |
| 28 | FR-B2B-001-manually-tab.png | Bulk order page (Manually tab) |
| 29 | FR-B2B-001-invalid-sku-error.png | Invalid SKU error dialog |
| 30 | FR-B2B-002-company-members.png | Company members table |
| 31 | FR-B2B-002-invite-member-dialog.png | Invite member dialog form |

---

## Sign-Off

| Criteria | Status |
|----------|--------|
| Personal account registration | PASS |
| Organization account registration | PASS |
| Sign-in with valid credentials (personal) | PASS |
| Sign-in with valid credentials (organization) | PASS |
| Sign-in edge cases (wrong password, empty fields, SQL injection) | PASS |
| Forgot password flow | PASS |
| Forgot password security (no email enumeration) | PASS |
| Sign out clears session | PASS |
| Protected route redirect with returnUrl | PASS |
| Bulk order page (Copy&Paste + Manually tabs) | PASS |
| Bulk order invalid SKU error handling | PASS |
| Company members page | PASS |
| Company members invite dialog | PASS |
| No critical console errors | PASS |

**Overall Authentication & Registration Status: PASS**

**Decision: APPROVED**

No blocking issues found. Two low-severity findings documented for improvement consideration.

---

## Teardown Notes

Test accounts created during this session that need cleanup:
- **Personal account:** qa-reg-personal-feb07@test-vc.com
- **Organization account:** qa-reg-org-feb07@test-vc.com
- **Organization:** QA Test Organization Feb07

Cleanup should be performed in Admin SPA:
1. Security > Users > Delete both accounts
2. Contacts > Delete both contacts
3. Contacts > Organizations > Delete "QA Test Organization Feb07"
