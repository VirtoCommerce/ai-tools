# BUG (VCST-6669): Forced password change in the Admin SPA fails with 500, the current password is never sent — `[High]`

## Status: CONFIRMED
**Found by:** human
**Severity:** High — a user whose password is expired cannot get into the admin at all; on a fresh environment that is the default `admin`

Env: vcst-qa @ Platform 3.1093.0 (image `3.1093.0-pr-3154-4607-vcst-6630-expired-password`), VirtoCommerce.AdminAngularJs **3.1092.0**, AdminShell 3.1092.0 · reproduced 2026-11-04 · `playwright-firefox`

## Summary
On sign-in with an expired password, the AngularJS admin opens the forced Change password dialog with a
**Current password** field. After the user fills all fields and clicks **Change**, the request carries only
`newPassword`. The server answers 500 and the dialog shows "Sorry, we could't reset password for this user".
The password stays expired, so the user is stuck on the dialog.

## Preconditions
- A back-office account whose password is expired (an admin reset with "force password change on next sign-in",
  or the default `admin` on a fresh environment).

## Steps to reproduce
1. Open the Admin SPA (`{BACK_URL}/`) and sign in with the expired-password account.
2. The **Change password** dialog opens ("Your password has expired…"). Fill **Current password**, **New password**, **Repeat new password**.
3. Click **Change**.

## Expected
- The request includes the current password, the password is changed and the admin opens.
- If the current password is missing, the server answers 400 with a validation message, not 500.

## Actual
- `POST /api/platform/security/currentuser/changepassword` → **500** `{"message":"Value cannot be null. (Parameter 'providedPassword')"}`.
- Request body keys: `["newPassword"]` — `oldPassword` is absent although the field is filled.
- The dialog shows "Sorry, we could't reset password for this user" (the typo is in the product string), clears New password and disables **Change**.

![Forced dialog](../../screenshots/Forced-Password-Change-Drops-Current-Password/vcst6669-01-forced-dialog.png)
![After submit](../../screenshots/Forced-Password-Change-Drops-Current-Password/vcst6669-02-after-submit.png)

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | N/A | back-office flow only |
| 2. Backend Admin (AngularJS) | **FAIL** | screenshots above; submit sends `{newPassword}` only; scope tree: the `ng-if` child scope holds its own `postData` with `oldPassword`, the controller's `postData` (sent) holds only `newPassword` |
| 3. GraphQL xAPI | N/A | not on this path |
| 4. Platform REST API | **FAIL (secondary)** | direct `POST …/currentuser/changepassword` with `{newPassword}` → 500 instead of 400 |

**Owning layer:** Layer 2 — the admin drops the field. Layer 4 only turns the missing field into a 500.

Console: three "Possibly unhandled rejection" (401/403 on startup settings/modules calls for a not-yet-signed-in user) — unrelated noise; the 500 itself logs nothing.
HAR: `test-results/firefox/har/session.har` (local only — it embeds request bodies with test passwords; do not attach).

## Module Versions
AdminAngularJs 3.1092.0 (affected) · fix in **3.1094.0** (vc-module-admin-angular-js#2, merged 2026-11-04) · Platform fix vc-platform#3155 (400 instead of 500, merged 2026-11-04) — neither is deployed on vcst-qa yet.

## Root Cause Analysis
- `vc-module-admin-angular-js` @ 3.1092.0, `src/VirtoCommerce.AdminAngularJs.Web/Content/wwwroot/js/app/security/dialogs/changePasswordDialog.tpl.html:21` —
  `<div class="form-group" ng-if="requireCurrentPassword">` wraps `ng-model="postData.oldPassword"`.
- `…/js/app/security/security.js` controller `platformWebApp.changePasswordDialog` sets `$scope.requireCurrentPassword` but never `$scope.postData = {}`, so `ng-model` creates `postData` on the `ng-if` child scope; `$scope.ok` sends the parent's `$scope.postData`.
- Server: `SecurityController.ChangeCurrentUserPassword` passes the null `OldPassword` to `UserManager.ChangePasswordAsync` → `ArgumentNullException` → 500.
- Introduced by VCST-6121 (vc-platform#3144, the `ng-if` for passkey-only accounts), carried into the module by VCST-6338. The 3.1094.0 fix adds `$scope.postData = {}`.

## Related
VCST-6121 (passkeys), VCST-6338 (AngularJS admin moved to a module), VCST-6630 (expired-password check on passkey/OTP sign-in) · bug catalog `VC-AUTH-007`, `VC-API-010` · kb `KB-C6F234F9`.

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 2 — Admin
- **Suggested repo:** VirtoCommerce/vc-module-admin-angular-js (+ vc-platform for the 400)
- **repoKind:** module
- **Ownership hint:** platform
- **Component / module:** AngularJS admin `platformWebApp.changePasswordDialog`
- **RCA anchor:** `changePasswordDialog.tpl.html:21` `ng-if="requireCurrentPassword"`; `security.js` controller without `$scope.postData = {}`
- **Routing confidence:** HIGH — already fixed by vc-module-admin-angular-js#2 and vc-platform#3155; what remains is deploying 3.1094.0 and verifying with `/qa-verify-fix VCST-6669`
