# BUG: MFA copy: the Backoffice says "The user turned it on" for an admin-set mode, and the AdminManaged company widget says "each member decides" — `[Low]`

## Status: READY_TO_SUBMIT
**Found by:** agent — testing VCST-6597

Env: vcst · Platform 3.1094.0 · VirtoCommerce.MFA 3.1002.0-pr-3-1a0f (vc-module-mfa#3 @1a0f481) · theme 2.62.0-pr-2622-caac (vc-frontend#2622 @caac275) · AdminShell 3.1093.0 · global MFA off · 2026-11-04
Filing: Below the filing floor: draft + a line in the VCST-6597 comment

## Summary
(a) After an administrator sets Enabled, both admins (AngularJS blade and Admin Shell page) say "Turned on in the storefront…" and "The user turned it on." No data records who set a mode. (b) In an AdminManaged store, the maintainer's Company › Info widget says "Not required: each member decides for themselves." directly above "The store administrator manages two-factor authentication."

## Steps to reproduce
1. (a) Admin sets a customer to Enabled; open the Mode blade in AngularJS and in the Admin Shell
2. (b) B2B store in AdminManaged; the maintainer opens /company/info

## Expected
(a) Neutral or accurate attribution (README L42: the administrator can set Enabled). (b) No "each member decides" in AdminManaged (README L16, L41-43).

## Root Cause Analysis
(a) vc-module-mfa mfa-mode.tpl.html L16, mfa-mode.js L72-74, vue mode.vue L22/L143-145, Localizations en L60/L95; (b) vc-frontend mfa-settings-widget.vue L143-146, L160-163, locales/en.json L17/L37 · investigations/X-2/ · KB-2EEF45B7, KB-407E93C0

## Fix Routing (→ /qa-fix)
Two repos: (a) VirtoCommerce/vc-module-mfa, (b) VirtoCommerce/vc-frontend · Confidence: MEDIUM-HIGH
