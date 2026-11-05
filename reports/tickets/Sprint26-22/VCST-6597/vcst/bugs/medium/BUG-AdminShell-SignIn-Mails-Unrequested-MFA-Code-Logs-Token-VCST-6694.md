# BUG (VCST-6694): Admin Shell sign-in mails an unrequested MFA code and logs the 2FA ticket to the console — `[Medium]`

## Status: READY_TO_SUBMIT
Tracker: https://virtocommerce.atlassian.net/browse/VCST-6694 · Relates VCST-6597 · labels found-by-agent, found-in-testing (auto-fix labels withheld: the owning repo is a design decision, routing MEDIUM across two repos)
**Found by:** agent — testing VCST-6597

Env: vcst (ENV_RISK=test) · Platform 3.1094.0 · VirtoCommerce.AdminShell 3.1093.0 (@vc-shell/framework v2.7.0, commit 0c25dd4eb) · VirtoCommerce.MFA 3.1002.0-pr-3-1a0f (vc-module-mfa#3, OPEN, head 1a0f481) · Notifications 3.1018.0 · global `MultiFactorAuthentication.Enabled` = false · Firefox · repro 2/2, controls 0/2 · 2026-11-04
Trace: the stand sends no `Request-Id`/`traceparent`; join keys cf-ray `a555a01aeec770b0-VIE` at 18:19:10 GMT. App Insights N/A (the server answered as designed); the server-side record is the notification journal.
**Non-visual claim:** network, console and notification-journal evidence. The screenshots only show that no code step appears.

## Summary
The Backoffice sign-in in the Admin Shell correctly asks for no code (BL-AUTH-025). Right after the cookie login, though, vc-shell sends its own `POST /connect/token` password grant with no storeId. For a Backoffice user whose own store requires MFA, the module's own-store rule (BL-AUTH-020) answers `400 two_factor_required`. Every sign-in therefore mails the user an unrequested "Your sign-in code", and vc-shell logs the full `twoFactorToken` to the browser console at error level.

## Steps to reproduce
1. Global MFA off. Create a store with `MultiFactorAuthentication.StoreMode = Enabled`. Create a Manager account (not an administrator, with `mfa:read` + `mfa:manage`, user MFA mode at default) whose `StoreId` is that store.
2. Open `{BACK_URL}/apps/admin-shell/#/login` in a fresh browser context and sign in as that Manager.
3. Observe: the dashboard opens with no code step.
4. Network: `POST /api/platform/security/login` → `200 {"succeeded":true,"requiresTwoFactor":false}`, then `POST /connect/token` (`grant_type=password`, `scope=offline_access`, no storeId) → **400** `two_factor_required` with a `twoFactorToken`.
5. Console (error): `[@vc-shell/framework#use-user] fetchToken - HTTP error: 400 {"twoFactorToken":"…"}`. The logged token is byte-identical to the response's.
6. Notifications › journal: one `MfaSignInEmailNotification` "Your sign-in code" per sign-in, created +0.4–0.5 s after the submit.

## Actual
- A code email nobody asked for, on every Admin Shell sign-in of such a user (2/2).
- The live 2FA ticket is written to the console (it is redeemable at `grant_type=mfa` with the emailed code within its lifetime).
- The shell then works on the cookie alone (all later calls 200, no Authorization header); only the AI-agent plugin's `getAccessToken` would get null (not exercised).
- Controls: own store `Disabled`, or Use global setting → `/connect/token` 200, no console error, no email.

## Expected
- BL-AUTH-025 and vc-module-mfa README @1a0f481 L20: "The Backoffice sign-in has no token request and follows only the global setting, for every user." With global MFA off, a Backoffice sign-in sends no code email.
- No credential or 2FA ticket is written to the console.

## Layer Validation
| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront / Admin Shell client | FAIL | `investigations/X-1/console/console-enabled-signin.log`, `network/failing-connect-token-400.txt` |
| 2. Backend Admin (cookie login) | PASS | `network/context-login-currentuser-cookie-auth.txt` |
| 3. GraphQL xAPI | N/A — not probed by the investigation | — |
| 4. Platform REST (`/connect/token`) | PASS (answers per BL-AUTH-020) | `network/failing-connect-token-400.txt`, `network/journal-mfa-signin-rows.json` |

**Owning layer:** the Admin Shell client (vc-shell), where the token request originates.

## Root Cause Analysis
- vc-shell `framework/core/composables/useUser/index.ts` @0c25dd4eb (main @9f151f5 identical): `signIn()` L226 does the cookie login, then L236-241 sends an unconditional `fetchToken({grant_type:"password", username, password, scope:"offline_access"})`. `fetchToken()` L130-131 does `logger.error("fetchToken - HTTP error:", status, statusText, errorBody)`, which logs the raw body including `twoFactorToken`.
- vc-module-mfa README L18 / BL-AUTH-020: the user's own store applies to every token-endpoint password sign-in, with or without a storeId. README L20 assumes the Backoffice sends no token request; the Admin Shell breaks that assumption.
- Not a regression of shipped behaviour: the own-store rule is new in vc-module-mfa#3.
- Package: `reports/tickets/Sprint26-22/VCST-6597/vcst/investigations/X-1/` (`evidence-index.md`, `root-cause.md`). Do not attach `test-results/firefox/har/session.har` (unmasked credentials).

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 1 — Admin Shell client (vc-shell)
- **Suggested repo:** VirtoCommerce/vc-shell (primary: the eager password grant in `signIn` and the raw-body logging in `fetchToken`); secondary VirtoCommerce/vc-module-mfa (exempt a Backoffice account's grant from the own-store rule, or send no code for it). Author decision.
- **repoKind:** frontend
- **Ownership hint:** platform
- **Component / module:** @vc-shell/framework `useUser` (shipped as VirtoCommerce.AdminShell)
- **RCA anchor:** `framework/core/composables/useUser/index.ts` L236-241, L130-131
- **Routing confidence:** MEDIUM — the mechanism is proven; which repo owns the email half is a design decision. The console leak is vc-shell.
