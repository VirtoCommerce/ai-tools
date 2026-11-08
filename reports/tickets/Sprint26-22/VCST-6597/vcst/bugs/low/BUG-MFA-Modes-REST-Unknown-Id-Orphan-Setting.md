# BUG: MFA modes REST stores a mode for an unknown user or organization id, and a mode survives deletion — `[Low]`

## Status: READY_TO_SUBMIT
**Found by:** agent — testing VCST-6597

Env: vcst · Platform 3.1094.0 · VirtoCommerce.MFA 3.1002.0-pr-3-1a0f (vc-module-mfa#3 @1a0f481) · theme 2.62.0-pr-2622-caac (vc-frontend#2622 @caac275) · AdminShell 3.1093.0 · global MFA off · 2026-11-04
Filing: Below the filing floor: draft + a line in the VCST-6597 comment. Expected behaviour is an author question

## Summary
PUT api/mfa/modes/users/{id} and organizations/{id} answer 200 for ids that do not exist and store the mode (GET reads it back). The organization status answers 200 with Required rows for a ghost organization while the user status answers 404. No delete handler is registered, so a mode survives deletion of its user or organization.

## Steps to reproduce
1. PUT api/mfa/modes/users/<random guid> {mode:Required} → 200; GET → Required; GET …/status → 404
2. PUT api/mfa/modes/organizations/<random guid> {mode:Enabled} → 200; GET → Enabled; GET …/status → 200 with Required rows
3. Delete a user/org with a mode set: GET still returns the mode

## Expected
404 for an unknown id on both PUTs and on the organization status (as the user status does); the mode removed with its user/organization.

## Root Cause Analysis
MfaModesController.cs L30-39, L71-80; MfaModeService.cs L63-75 (only an empty id is rejected); MfaStatusService.cs L46-52; Module.cs (no delete handlers) · regression REG-2026-11-04-1531 case MFA-070 · reports/regression/REG-2026-11-04-1531/evidence/MFA-070/ · KB-66BB028C, KB-27704B72

## Fix Routing (→ /qa-fix)
Layer: REST · Repo: VirtoCommerce/vc-module-mfa · repoKind: module · Confidence: MEDIUM
