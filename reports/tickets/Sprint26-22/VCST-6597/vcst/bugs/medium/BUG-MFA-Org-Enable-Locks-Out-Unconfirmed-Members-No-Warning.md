# BUG: Turning MFA on for a company locks out members with an unconfirmed email, and nobody is warned — `[Medium]`

## Status: READY_TO_SUBMIT
**Found by:** agent — testing VCST-6597

Env: vcst · Platform 3.1094.0 · VirtoCommerce.MFA 3.1002.0-pr-3-1a0f (vc-module-mfa#3 @1a0f481) · theme 2.62.0-pr-2622-caac (vc-frontend#2622 @caac275) · AdminShell 3.1093.0 · global MFA off · 2026-11-04
Filing: IN-SCOPE → To-fix row F-1 on VCST-6597 (no tracker item). Pending a PO decision: refuse, or warn, when enabling

## Summary
A maintainer (updateMfaOrganizationMode) or an administrator (PUT api/mfa/modes/organizations/{id}) turns an organization on. It succeeds, and the response has no field that could carry a warning. A member whose email is not confirmed then gets 400 mfa_provider_not_available at every password sign-in, with no email sent: locked out. No status API, Backoffice blade or storefront widget shows the maintainer or the admin who is affected. The lockout is documented (README L29/L144); the missing refusal or warning is not.

## Steps to reproduce
1. CustomerChoice store; an org-mfa-maintainer and a member; set the member emailConfirmed=false
2. The member signs in: 200, no code (control)
3. The maintainer turns the company on with a change code: succeeded true, errorCode null, no warning
4. The member signs in: 400 mfa_provider_not_available, 0 journal rows (3/3)
5. Admin PUT org Off: the member signs in again; admin PUT Enabled: same lockout

## Expected
A decision for the PO (README L29 puts the burden on the operator): either refuse turning an organization on while members cannot receive a code, or warn the maintainer/admin and name the affected members.

## Root Cause Analysis
MfaSelfService.cs L155-178 (ChangeOrganizationModeCoreAsync saves with no member check); MfaModesController.cs L68-81; MfaChangeResponse.cs L5-16 (no warning field); MfaService.cs L253-260 / L353-360 (provider check) · investigations/C-14/ · KB-2DF21203, KB-C91A3971

## Fix Routing (→ /qa-fix)
Layer: REST/xAPI (module) · Repo: VirtoCommerce/vc-module-mfa · repoKind: module · Confidence: MEDIUM (mechanism) / LOW (defect — PO decision)
