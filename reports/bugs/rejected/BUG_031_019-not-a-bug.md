# BUG_031_019 — Sign-in error "Email verification required" has no Resend Verification action

**Status:** REJECTED — not a bug (by design)
**Rejected:** 2026-04-21 by product owner
**Rationale:** Self-service Resend on the storefront sign-in page is not a product requirement. Recovery is intended to go through the operator workflow: Admin SPA → Security → User account → Resend, then extract the verification link from the Notifications list. Test case AUTH-019 expectation should be rewritten to cover the operator workflow; the plain-text "Email verification required" error on sign-in is the intended UX.
**Action for suite 031:** revise AUTH-019 to verify (a) the sign-in block occurs and (b) admin Resend + Notifications link works. Drop the "inline Resend link must exist" assertion.
**Domain:** Authentication > Sign-in > Email Verification (Mandatory mode)
**Found In Run:** REG-2026-04-20-1000 (AUTH-019, suite 031-auth-login-register)
**Investigation:** 2026-04-21 09:06–09:12 UTC (Edge / playwright-edge)
**Linked Test:** AUTH-019 "Login - Email Verification Required"
**Verdict:** Storefront behavior confirmed — but reclassified from BUG → BY DESIGN.

---

## Summary

When store setting `Stores.EmailVerificationRequired=true` (MANDATORY mode), a user who registers but does not verify their email is correctly blocked from signing in with the message:

> **"Email verification required. Verify your email address"**

However this message is rendered as a plain `<span>` inside a `vc-alert` danger block — **it is NOT a link and offers NO actionable recovery control**. Users whose verification email never arrives, is filtered to spam, or expires have **no self-service way to request a new verification email**. No Resend button is present on the sign-in page, on the registration-success page, on a dedicated `/resend-verification` or `/verify-email` route (both return 404), or anywhere else in the public UX.

## Impact

- Users locked out of the storefront with no **self-service** recovery path short of re-registering with a new email or contacting support. Support cost + lost conversions.
- Every mailbox/email-service transient failure (quota, greylisting, spam filter) becomes permanent for the end user.
- Contradicts industry-standard auth UX (Gmail/Microsoft/GitHub/Shopify all expose a Resend control on the blocker screen).

## Operator-side workaround exists (not a substitute)

An **admin operator** can trigger resend via: Admin SPA → **Security → Users → [user account] → Resend** (verification link). The email is recorded in the platform **Notifications** list; the verification link can be extracted from the notification body for manual delivery. This confirms the backend supports resend and the token/email template are wired correctly — the gap is strictly in the **storefront self-service UX**. Shipping a Resend button on `/sign-in` requires only exposing the existing operator endpoint to the unauthenticated storefront (with rate-limit + email-enumeration protection).

## Environment

| Field | Value |
|---|---|
| Storefront | https://vcst-qa-storefront.govirto.com (B2B-store) |
| Storefront version | 2.47.0-alpha.2306 |
| Store | B2B-store |
| Setting | `Stores.EmailVerificationEnabled=true`, `Stores.EmailVerificationRequired=true` |
| Browser | Microsoft Edge (Edg/147.0.0.0) via playwright-edge |
| Test user | `bug019-unverified-1776762600@test-agent.com` (unverified, just-registered) |

## Steps to Reproduce

1. Admin enables MANDATORY email verification on the B2B-store:
   ```
   PUT /api/stores
   body: { ...store, settings: [..., {name:"Stores.EmailVerificationRequired", value:true}] }
   → 204 No Content
   ```
2. Sign out of any existing storefront session. Open a fresh browser context.
3. Navigate to `/sign-up`. Register a new Personal account with a fresh email (do NOT click any verification link in the mailbox).
4. Observe `/successful-registration` page — note that no Resend link/button is present, only **Home page**.
5. Navigate to `/sign-in`. Enter the unverified credentials and submit.
6. **BUG**: The page shows the error banner "Email verification required. Verify your email address" as plain text. There is NO actionable Resend Verification control adjacent to or inside the error, elsewhere on the page, or on any known auxiliary route.

## Expected vs Actual

| | Expected | Actual |
|---|---|---|
| Error message | Visible with specific text | OK — "Email verification required. Verify your email address" |
| Resend action | Present as link/button near the error | **ABSENT** — no `<a>` or `<button>` with resend/verify semantics anywhere in the page |
| Dedicated route `/resend-verification` | Either a visible form on sign-in OR a separate route | Route returns **404 Page not found** |
| Dedicated route `/verify-email` | Same | Route returns **404 Page not found** |
| Registration success page | Offers Resend link | Only **Home page** button |

## Evidence

All screenshots and DOM dumps captured during investigation.

### 1. Sign-in rejection UI with no Resend control (primary)
`reports/regression/REG-2026-04-20-1000/invest-evidence/invest-BUG_031_019-signin-error-no-resend.png`

### 2. Successful-registration page — no Resend link
`reports/regression/REG-2026-04-20-1000/invest-evidence/invest-BUG_031_019-successful-registration-no-resend.png`
Page body text: *"Thank you for showing your interest in registering with us. We kindly ask you to check your mailbox to verify the email address you've entered."* — then only a **HOME PAGE** button.

### 3. Alternate recovery route returns 404
`reports/regression/REG-2026-04-20-1000/invest-evidence/invest-BUG_031_019-verify-email-route-404.png` (for `/verify-email`; `/resend-verification` behaves identically)

### 4. DOM of error region (plain span, no link, no button)
```html
<div class="vc-alert vc-alert--outline-dark vc-alert--outline-dark--danger vc-alert--size--sm mb-4"
     data-test-id="sign-in-page.sign-in-error-email_verification_is_required-alert">
  <div class="vc-alert__icon"><span class="vc-icon">...</span></div>
  <div class="vc-alert__content">
    <span>Email verification required. Verify your email address</span>
  </div>
</div>
```
The `<span>` has no `href`, no `role="link"`, no click handler. Programmatic scan of ALL `<a>` and `<button>` elements on the page matching `/resend|verify.*email|verification.*email/i` returned **an empty array**.

### 5. Network: login denied as expected
`POST /connect/token` → **400 Bad Request**
```
grant_type=password&scope=offline_access&storeId=B2B-store&username=bug019-unverified-1776762600%40test-agent.com&password=Password1%21
```

### 6. Only interactive controls on sign-in page
Nearby `<a>` / `<button>` elements around the error:
- `Forgot your password?` → `/forgot-password`
- `Sign in` (retry) button
- `Sign up` → `/sign-up`
- NO resend/verify-email control

## Root Cause Hypothesis

The VC storefront's sign-in error-state renderer surfaces the backend's `email_verification_is_required` error code as a static alert message only; there is no associated action control wired up. A complete implementation would either:
- Render a "Resend verification email" button/link alongside the error, wired to a `POST /storefrontapi/account/resend-verification-email` (or xAPI `requestAccountVerification` mutation); or
- Link the error to a dedicated `/resend-verification` route where the user re-enters their email.

Neither exists in `2.47.0-alpha.2306`.

## Severity Justification (Medium)

- **Not blocking core purchase flow** for verified users.
- **Blocks 100 % of registrations where the verification email is not received**, which is a non-zero real-world failure rate (spam filters, typos that passed validation, etc.).
- Self-service UX gap with clear remediation path; not a security/data-loss issue.

## Suggested Fix

On the sign-in page, when the `email_verification_is_required` error is returned, render a secondary action **"Resend verification email"** inside `.vc-alert__content` that triggers the backend resend endpoint with the email from the sign-in form. Also add the same control to the `/successful-registration` page (with a small visible cooldown to prevent abuse).

## Config Cleanup (performed)

| Setting | Before | During test | After |
|---|---|---|---|
| `Stores.EmailVerificationRequired` | false | true | **false (restored)** |
| `Stores.EmailVerificationEnabled` | true | true | true (unchanged) |

Both values verified via `GET /api/stores/B2B-store` after the cleanup PUT (204).

## Artifacts (repo-root)

- `reports/regression/REG-2026-04-20-1000/invest-evidence/invest-BUG_031_019-signin-error-no-resend.png`
- `reports/regression/REG-2026-04-20-1000/invest-evidence/invest-BUG_031_019-successful-registration-no-resend.png`
- `reports/regression/REG-2026-04-20-1000/invest-evidence/invest-BUG_031_019-verify-email-route-404.png`
