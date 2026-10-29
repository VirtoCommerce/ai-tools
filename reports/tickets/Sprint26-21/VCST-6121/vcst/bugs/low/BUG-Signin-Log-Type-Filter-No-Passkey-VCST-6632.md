# BUG: Admin Sign-in log Type filter has no Passkey option (nor OTP) `[Low]`

## Status: READY_TO_SUBMIT
**Found by:** agent — testing VCST-6121
**Tracker:** [VCST-6632](https://virtocommerce.atlassian.net/browse/VCST-6632) (Relates VCST-6121) · **Severity:** Low · **Priority:** Low

**Env:** vcst (vcst-qa.govirto.com) @ Platform 3.1091.0-pr-3144-9e58 · VirtoCommerce.Passkeys 3.1000.0-pr-1-a25f · OTP 3.1001.0 · MFA 3.1000.0 · Firefox (playwright-firefox), administrator

## Summary
The back-office Sign-in log list cannot be filtered to passkey sign-ins: the **Type** select has no **Passkey** option, although the grid lists rows of Type Passkey. The REST search filters by `signInTypes` = `Passkey` correctly, so only the Admin UI filter registry is missing the type. OTP has the same gap.

## Steps to reproduce
1. Have at least one passkey sign-in in the log within the last 24 hours.
2. Sign in to the back office (`{{BACK_URL}}`) as administrator.
3. **Security** → **Sign-in log** → **View all records**.
4. Click the filters icon left of the search box, open the **Type** select.

## Expected vs Actual
- **Expected:** the Type select offers **Passkey** (and **OTP**); choosing it lists only those rows. Source: VCST-6121 AC "Sign-in audit events should handle Signin by Passkey"; the MFA module registers its own type the same way.
- **Actual:** options are exactly All, Password, External provider, On behalf, On behalf revert, Sign out, Multi-factor authentication. No Passkey, no OTP — while the grid shows rows with Type Passkey and OTP.

![Type filter without Passkey; grid rows of Type Passkey/OTP](../screenshots/Signin-Log-Type-Filter-No-Passkey/PKA-010-type-filter-no-passkey.png)

## Layer Validation
| Layer | Result | Evidence |
|---|---|---|
| 1. Storefront | N/A | back-office-only surface |
| 2. Admin SPA | FAIL | Type select lacks Passkey/OTP (screenshot above) |
| 3. GraphQL xAPI | N/A | sign-in log is not exposed in xAPI |
| 4. REST | PASS | `POST /api/platform/security/sign-in-log/search` with `signInTypes` = `Passkey` returns only passkey rows (KB-3C48DBCA, KB-4696F47F) |

## Root Cause Analysis
- vc-platform `src/VirtoCommerce.Platform.Web/wwwroot/js/app/security/blades/sign-in-log-list.js:31-32` builds the options from `signInLogTypes.getAll()`; `security/services/signInLogTypes.js` is a static list (Password, External, Impersonation, ImpersonationRevert, Logout) whose only extension point is `register()`.
- vc-module-mfa `src/VirtoCommerce.MFA.Web/Scripts/mfa.js:22-24` registers `MFA` — the precedent.
- vc-module-passkeys `src/VirtoCommerce.Passkeys.Web/Scripts/module.js` never calls `signInLogTypes.register` (`search_code` for `signInLogTypes` in the repo: 0 hits); its type is `ModuleConstants.SignInType = "Passkey"` (`ModuleConstants.cs:7`).
- Secondary: the OTP module does not register `OTP` either (separate repo, same gap).
- kb: KB-49540DA1 (corroborated, suspected defect). VirtoOZ Platform User Guide does not document the Sign-in log Type filter.
- Need hotfixes: not set — VirtoCommerce.Passkeys is in neither stable bundle v16 nor v15.

Case that catches it: `PKA-010` in `regression/suites/Backend/api/115-passkey-sign-in-api-backoffice.csv`.

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 2 — Admin
- **Suggested repo:** VirtoCommerce/vc-module-passkeys
- **repoKind:** module
- **Ownership hint:** platform
- **Component / module:** Passkeys Admin SPA (`Scripts/module.js` run block + a localization label)
- **RCA anchor:** `src/VirtoCommerce.Passkeys.Web/Scripts/module.js` — missing `signInLogTypes.register({ label: …, value: 'Passkey' })` (precedent `vc-module-mfa` `Scripts/mfa.js:22-24`)
- **Routing confidence:** HIGH (search_code confirms the module never references `signInLogTypes`; OTP is a separate one-line gap in the OTP module, not part of this fix)
