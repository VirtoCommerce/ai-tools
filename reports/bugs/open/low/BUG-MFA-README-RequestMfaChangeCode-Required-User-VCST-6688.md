# BUG (VCST-6688): vc-module-mfa README: requestMfaChangeCode is documented as refused for a Required user, but it sends a code — `[Low]`

## Status: READY_TO_SUBMIT
**Found by:** agent — testing VCST-6597
**Severity:** Low. The docs and the behaviour disagree; one unneeded email is sent, and the mode change itself is still refused

Env: vcst · Platform 3.1094.0 · VirtoCommerce.MFA 3.1002.0-pr-3-1a0f (vc-module-mfa#3, OPEN, head 1a0f481) · Customer 3.1032.0 · theme 2.62.0-pr-2622-caac-caac275a · global MFA off · disposable AGENT-TEST-MFA data · 2026-11-04
Tracker: https://virtocommerce.atlassian.net/browse/VCST-6688 · Relates VCST-6597

## Summary
README §Storefront (xAPI) says the code request before a change is refused with `mfa_locked_by_administrator`
for a `Required` user and no code is sent. On the stand, the code is sent and only `updateMfaUserMode` is refused. The owner decides
whether to refuse the request or fix the README. **Non-visual claim:** xAPI and notification-journal evidence only, no UI screenshot.

## Steps to reproduce
1. CustomerChoice store; a customer set to Required by the admin.
2. Call `requestMfaChangeCode`; check the notification journal.
3. Call `updateMfaUserMode` with the code.
4. Call `requestMfaChangeCode` again inside the resend interval.

## Expected
The code request is refused with `mfa_locked_by_administrator` and no email is sent, as documented. Otherwise the README says the refusal happens at `updateMfaUserMode`. The README also documents what a repeat request inside the resend interval returns.

## Actual
- `requestMfaChangeCode` → `succeeded: true` + `twoFactorToken`; 1 email in the journal.
- `updateMfaUserMode` → `mfa_locked_by_administrator`.
- A repeat inside the resend interval → `succeeded: true`, a new token, no second email. The errors table lists `resend_too_soon` only for `/api/mfa/resend` and the code screen. Case MFA-049.

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | N/A | not exercised |
| 2. Backend Admin | N/A | not exercised |
| 3. GraphQL xAPI | **FAIL (vs README)** | `requestMfaChangeCode` → `succeeded: true`, 1 email |
| 4. Platform REST API | N/A | not on this path |

**Owning layer:** Layer 3 — xAPI, or the README (docs).

## Module Versions
VirtoCommerce.MFA 3.1002.0-pr-3-1a0f (unmerged PR). Need hotfixes: not applicable — the code is in no released stable bundle.

## Root Cause Analysis
`vc-module-mfa@1a0f481` `MfaSelfService.SendChangeCodeCoreAsync` (L86-104) checks only the store mode, not the user's mode.

## Related
VCST-6597 · kb KB-AE01D50C.

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 3 — xAPI (or README)
- **Suggested repo:** VirtoCommerce/vc-module-mfa (the fix belongs in open PR #3)
- **repoKind:** module
- **Ownership hint:** platform
- **Component / module:** MFA self-service / README §Storefront (xAPI)
- **RCA anchor:** `MfaSelfService.SendChangeCodeCoreAsync` L86-104
- **Routing confidence:** HIGH, but the owner chooses between changing the code and changing the docs. Auto-fix labels withheld.
