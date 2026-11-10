# BUG: Admin Shell: a disabled VcSelect stays a Tab stop and is not announced as disabled — `[Low]`

## Status: READY_TO_SUBMIT
**Found by:** agent — testing VCST-6597

Env: vcst · Platform 3.1094.0 · VirtoCommerce.MFA 3.1002.0-pr-3-1a0f (vc-module-mfa#3 @1a0f481) · theme 2.62.0-pr-2622-caac (vc-frontend#2622 @caac275) · AdminShell 3.1093.0 · global MFA off · 2026-11-04
Filing: Below the filing floor (BL-A11Y, Low): draft + a line in the VCST-6597 comment

## Summary
The locked "Mode" select (a manager with mfa:read only) keeps tabindex 0 and has no aria-disabled, so it is a Tab stop announced as active (Enter does nothing). The same blade's disabled switch shows [disabled]. Affects every disabled VcSelect.

## Steps to reproduce
1. Admin Shell, a manager with mfa:read only, open a user's MFA mode page
2. Tab to Mode: the combobox takes focus and is not reported as disabled

## Expected
A disabled select is announced as disabled (BL-A11Y-001).

## Root Cause Analysis
vc-shell SelectTrigger.vue @v2.7.0 L45-53 (tabindex 0, no aria-disabled binding) · investigations/X-3/ (a11y-03) · KB-1AD3367C

## Fix Routing (→ /qa-fix)
Layer: Admin Shell client · Repo: VirtoCommerce/vc-shell · repoKind: frontend · Confidence: MEDIUM
