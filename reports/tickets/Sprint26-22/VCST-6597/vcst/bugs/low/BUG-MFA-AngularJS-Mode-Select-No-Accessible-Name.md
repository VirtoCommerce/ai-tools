# BUG: AngularJS MFA Mode blade: the select is named "Select box"; its visible label is not linked — `[Low]`

## Status: READY_TO_SUBMIT
**Found by:** agent — testing VCST-6597

Env: vcst · Platform 3.1094.0 · VirtoCommerce.MFA 3.1002.0-pr-3-1a0f (vc-module-mfa#3 @1a0f481) · theme 2.62.0-pr-2622-caac (vc-frontend#2622 @caac275) · AdminShell 3.1093.0 · global MFA off · 2026-11-04
Filing: Below the filing floor (BL-A11Y, Low): draft + a line in the VCST-6597 comment

## Summary
In the AngularJS Mode blade the Mode ui-select has no title and its visible label is not associated, so it is exposed as combobox "Select box". The open list marks no option as selected (platform-bundled ui-select).

## Steps to reproduce
1. AngularJS admin, a manager with mfa:manage, open a user's Multi-factor authentication widget
2. Accessibility tree: combobox "Select box", not "Mode"

## Expected
The select is named "Mode" (BL-A11Y-002).

## Root Cause Analysis
vc-module-mfa Scripts/blades/mfa-mode.tpl.html @1a0f481 L6-13 · investigations/X-3/ · KB-1AD3367C

## Fix Routing (→ /qa-fix)
Layer: Admin SPA · Repo: VirtoCommerce/vc-module-mfa · repoKind: module · Confidence: MEDIUM
