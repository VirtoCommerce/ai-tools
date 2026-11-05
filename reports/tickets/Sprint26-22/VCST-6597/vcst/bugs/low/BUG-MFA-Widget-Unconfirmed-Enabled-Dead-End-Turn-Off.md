# BUG: MFA widget: admin-set Enabled on an unconfirmed email shows an empty destination, "You turned it on" and a Turn off that can never succeed — `[Low]`

## Status: READY_TO_SUBMIT
**Found by:** agent — testing VCST-6597

Env: vcst · Platform 3.1094.0 · VirtoCommerce.MFA 3.1002.0-pr-3-1a0f (vc-module-mfa#3 @1a0f481) · theme 2.62.0-pr-2622-caac (vc-frontend#2622 @caac275) · AdminShell 3.1093.0 · global MFA off · 2026-11-04
Filing: Below the filing floor: draft + a line in the VCST-6597 comment

## Summary
An administrator sets Enabled on a customer whose email is not confirmed. Account › Security reads "You turned it on: we send a code to  every time you sign in." (no destination, and the admin set it), and Turn off stays enabled but always fails with mfa_provider_not_available. Any admin-set Enabled reads "You turned it on", also for confirmed customers: the API has no "set by" field.

## Steps to reproduce
1. Unconfirmed customer signed in on a CustomerChoice store
2. Admin PUT api/mfa/modes/users/{id} Enabled; reload Account › Security
3. Click Turn off: "We can't send a sign-in code to this account. Please contact your administrator." (3/3)

## Expected
Turn off disabled with the confirm-email hint (as Turn on already is in the Off state); no empty destination; neutral wording for who turned it on (README L40-42: an administrator can set Enabled).

## Root Cause Analysis
vc-frontend mfa-settings-widget.vue L9 (only Turn on is disabled), L27-35 (hint only when Off), L152-157 (status text, destination ?? "") · investigations/C-13/ · KB-39374F04

## Fix Routing (→ /qa-fix)
Layer: storefront · Repo: VirtoCommerce/vc-frontend (PR #2622) · repoKind: frontend · Confidence: MEDIUM
