# BUG: The code that confirms an MFA mode change is sent as "Your sign-in code" — `[Low]`

## Status: READY_TO_SUBMIT
**Found by:** agent — testing VCST-6597

Env: vcst · Platform 3.1094.0 · VirtoCommerce.MFA 3.1002.0-pr-3-1a0f (vc-module-mfa#3 @1a0f481) · theme 2.62.0-pr-2622-caac (vc-frontend#2622 @caac275) · AdminShell 3.1093.0 · global MFA off · 2026-11-04
Filing: Below the filing floor: draft + a line in the VCST-6597 comment. Defect or design: PO

## Summary
requestMfaChangeCode sends the same MfaSignInEmailNotification as a sign-in: subject "Your sign-in code", body "If you did not try to sign in, change your password." Nothing says the code confirms turning two-factor authentication on or off. The purpose stops at the ticket and never reaches delivery.

## Steps to reproduce
1. CustomerChoice store, a confirmed customer
2. requestMfaChangeCode (turn on), then a password sign-in, then requestMfaChangeCode (turn off), each >35 s apart
3. Notification journal: three identical rows except the code (1/1, deterministic)

## Expected
A change-specific subject/body for Purpose=Change tickets (README L97: change codes exist so a stolen session cannot turn MFA off).

## Root Cause Analysis
MfaSelfService.cs L93 (purpose Change); MfaService.cs L62 (stored on the ticket only), L253, L320-329; IMfaProvider.SendCodeAsync has no purpose; EmailMfaProvider.cs L47-67 · investigations/C-33/ · KB-76F9AECF

## Fix Routing (→ /qa-fix)
Layer: module · Repo: VirtoCommerce/vc-module-mfa · repoKind: module · Confidence: MEDIUM
