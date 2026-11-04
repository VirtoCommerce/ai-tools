# BUG (VCST-6687): MFA: updateMfaUserMode is not refused for a member of an organization that requires the code — `[Low]`

## Status: READY_TO_SUBMIT
**Found by:** agent — testing VCST-6597
**Severity:** Low. Sign-in stays protected while the organization requires the code; the hidden `Off` takes effect only if the organization later drops the requirement

Env: vcst · Platform 3.1094.0 · VirtoCommerce.MFA 3.1002.0-pr-3-1a0f (vc-module-mfa#3, OPEN, head 1a0f481) · Customer 3.1032.0 · theme 2.62.0-pr-2622-caac-caac275a · global MFA off · disposable AGENT-TEST-MFA data · 2026-11-04
Tracker: https://virtocommerce.atlassian.net/browse/VCST-6687 · Relates VCST-6597

## Summary
While an organization requires the code, the storefront hides the user's own MFA switch. The xAPI mutation
still accepts the change and stores the user mode as `Off`. **Non-visual claim:** xAPI evidence only, no UI screenshot.

## Steps to reproduce
1. Store mode CustomerChoice; organization MFA mode Required; the member's own mode Enabled.
2. Sign in as the member; call `requestMfaChangeCode` and take the code from the email.
3. Call `updateMfaUserMode(enabled: false)` with that code.
4. Read the stored user mode and `mfaSettings.requiredBy`; sign in again.

## Expected
The change is refused (e.g. `mfa_locked_by_organization` / `mfa_self_service_not_allowed`) while an organization of the user requires the code, and the mode stays unchanged.
Source: VCST-6597 "a member can't turn it off with their own switch"; README "the user's own mode changes nothing".

## Actual
- `updateMfaUserMode` → `succeeded: true`; stored user mode → `Off`.
- `mfaSettings.requiredBy` stays `Organization`; the next sign-in still asks for the code.
- If the organization later turns MFA off, the member is silently Off. Case MFA-052 (suite 110a).

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | N/A | switch is hidden per README and widget source; not re-checked for this filing |
| 2. Backend Admin | N/A | not exercised |
| 3. GraphQL xAPI | **FAIL** | `updateMfaUserMode` → `succeeded: true`, mode stored `Off` |
| 4. Platform REST API | N/A | the rule lives in the xAPI self-service |

**Owning layer:** Layer 3 — xAPI (the module's self-service).

## Module Versions
VirtoCommerce.MFA 3.1002.0-pr-3-1a0f (unmerged PR). Need hotfixes: not applicable — the code is in no released stable bundle.

## Root Cause Analysis
`vc-module-mfa@1a0f481` `src/VirtoCommerce.MFA.Data/Services/MfaSelfService.cs:119`:
`CanChangeUserMode = isCustomerChoice && UserMode != Required` does not check whether an organization requires the code.

## Related
VCST-6597 · kb KB-9D98737B · domain map `auth.md` D30.

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 3 — xAPI
- **Suggested repo:** VirtoCommerce/vc-module-mfa (the fix belongs in open PR #3)
- **repoKind:** module
- **Ownership hint:** platform
- **Component / module:** MFA self-service (`MfaSelfService`)
- **RCA anchor:** `src/VirtoCommerce.MFA.Data/Services/MfaSelfService.cs:119`
- **Routing confidence:** HIGH. Auto-fix labels are withheld only because the code is in the open PR of the ticket under test.
