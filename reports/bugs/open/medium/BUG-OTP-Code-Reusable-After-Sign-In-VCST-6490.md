# OTP sign-in: the emailed code is not one-time — the same code signs in again until it expires — **Medium**

## Status: READY_TO_SUBMIT (filed as VCST-6490)
**Found by:** agent — testing auth domain map refresh (2026-10-21)
**Tracker:** [VCST-6490](https://virtocommerce.atlassian.net/browse/VCST-6490) · labels `found-by-agent`, `found-in-testing`. The auto-fix labels are withheld: the fix needs a product decision (see Fix Routing).

**Env:** vcptcore_qa1 · Platform `3.1087.0-pr-3134-a3d2` · VirtoCommerce.OTP `3.1000.0` (released) · Customer `3.1030.0-pr-321-c54f` · Store `3.1010.0` · `{{STORE_ID}}` with `OtpSignIn.Enabled` = true.
First seen 2026-09-29 on OTP `3.1000.0-pr-1-3e73` (kb KB-06FE6C8D).

## STR (REST)
1. `POST /api/otp/request` `{storeId: {{STORE_ID}}, email: @td(OTP_TRUSTED_STORE_CONTACT.email)}` returns `200 {succeeded: true}`.
2. Read the code from `POST /api/notifications/journal`; the newest message is of type `OtpSignInEmailNotification`.
3. `POST /connect/token` `grant_type=otp_email` with that email, code and storeId.
4. Repeat step 3 with the same code immediately.
5. Repeat step 3 with the same code 65 s later.

## Actual
Steps 3, 4 and 5 each returned **HTTP 200** with a new access token. The tokens are distinct (different `jti`) and each has `sub` = the seeded user id. Run at 2026-10-21 17:52:33Z, 17:52:34Z and 17:53:39Z.

## Expected
A one-time code works for one sign-in only. A second grant with the same code is refused like a wrong code (`invalid_code`). `{ECL}` ECL-4.3 "OTP reuse"; `{SPEC}` VCST-5748 names it a one-time code.

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | N/A | the storefront only forwards the code; the defect is the grant |
| 2. Backend Admin | N/A | not admin-visible |
| 3. GraphQL xAPI | N/A | no GraphQL sign-in (KB-0407F36E) |
| 4. Platform REST API | **FAIL** | `/connect/token grant_type=otp_email`, three 200s for one code |

**Owning layer:** Layer 4.

## Root Cause Analysis
`vc-module-otp` `src/VirtoCommerce.Otp.Data/Services/OtpService.cs` `VerifyCodeAsync` calls `userManager.VerifyUserTokenAsync(user, TokenOptions.DefaultEmailProvider, ModuleConstants.Security.TokenPurpose, code)`. That provider is stateless and time-boxed. On success the method only calls `ResetAccessFailedCountAsync`. Nothing marks the code as used, and nothing rotates the security stamp.

The README says: "The module stores nothing", and "Any change of the user's security stamp … invalidates the codes already sent".

vc-module-mfa#1 (VCST-5904) adds `IMfaUsedCodeStore`, but for MFA codes only.

No UI step is involved, so the evidence is REST output, not screenshots.

## Cases holding the expectation
Suite 105, the `Archetype:REPLAY` case: "KNOWN GAP (VCST-5748, round 2)", expected to FAIL until this is fixed. Mind map node `auth.signin.otp.replay` (DRIFT).

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 4 — REST (token grant)
- **Suggested repo:** VirtoCommerce/vc-module-otp
- **repoKind:** module
- **Ownership hint:** platform
- **Component / module:** OTP — `OtpService.VerifyCodeAsync`
- **RCA anchor:** `OtpService.cs` `VerifyUserTokenAsync(user, TokenOptions.DefaultEmailProvider`
- **Routing confidence:** HIGH. The fix approach is a product decision: a used-code store like the MFA module's, or a security-stamp rotation, which also signs out the user's other sessions. That is why the auto-fix labels are withheld.
