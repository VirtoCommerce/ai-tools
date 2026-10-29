# BUG (VCST-6630): Passkey and email-code sign-in force a password change on an account whose password is expired — `[High]`

## Status: READY_TO_SUBMIT
**Found by:** human
**Severity:** High — the only bypass is SSO; a user who never had a password, or signs in without one, is sent to Change Password

Env: vcst-qa @ Platform 3.1091.0 (pr-3144 passkeys), Xapi 3.1029.0, ProfileExperienceApi 3.1022.0, Passkeys 3.1000.0-pr-1, OTP 3.1001.0, AzureAD 3.1003.0, GoogleSSO 3.1003.0

## Summary
The expired-password check is skipped only when the session came from an external (SSO) sign-in. A passkey or
email-code (OTP) sign-in still gets `me.passwordExpired: true` and the storefront forces the Change Password page.
The expiry should be enforced **only** for a sign-in with a password (Artem Dudarev, 2026-10-29: fix it quickly).

## Steps to reproduce
1. Have a storefront user created through **Entra ID** sign-in, whose account has `passwordExpired = true`.
2. Sign in with Entra ID and add a passkey on **Account → Security**. Sign out.
3. Sign in with **Sign in with a passkey**.
4. Repeat with **Sign in with a code** (email OTP).

## Expected
- Passkey and email-code sign-in open the storefront as usual; no Change Password page.
- `me.passwordExpired` is `false` for that session, and no xAPI query fails with `PasswordExpired`.
- Only a sign-in with a password checks the expiry.

## Actual
- After the passkey sign-in the Change Password page opens; `me` returns `passwordExpired: true`.
- After the email-code sign-in the Change Password page opens too.

## Root cause
The condition is "expired and not external and not impersonated", so every non-password, non-SSO method falls through:
- `vc-module-x-api` `src/VirtoCommerce.Xapi.Data/Services/UserManagerCore.cs` — `if (user.PasswordExpired && !isExternalSignIn && !isImpersonated) throw AuthorizationError.PasswordExpired();`
- `vc-module-profile-experience-api` `Schemas/UserType.cs` `GetPasswordExpired` — `PasswordExpired && !IsExternalSignIn(context) && !IsImpersonated(context)`
- `vc-module-profile-experience-api` `Schemas/ProfileSchema.cs` — the same check before `PasswordExpired` is thrown.
Fix direction: check the expiry only when the token was issued by the password grant (invert the condition), not by listing every exempt method.

## Related
VCST-6121 (Passkey sign-in story), VCST-5748 (OTP sign-in), VCST-6598 (another passkey sign-in bug).

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 3 — xAPI
- **Suggested repo:** VirtoCommerce/vc-module-x-api + VirtoCommerce/vc-module-profile-experience-api
- **repoKind:** module
- **Ownership hint:** platform
- **Component / module:** xAPI user-state check; Profile xAPI `UserType.passwordExpired`
- **RCA anchor:** `UserManagerCore.CheckUserState` `!isExternalSignIn`; `UserType.GetPasswordExpired`
- **Routing confidence:** LOW — the check lives in two repos, and the token must carry how the user signed in (password vs passkey vs OTP)
