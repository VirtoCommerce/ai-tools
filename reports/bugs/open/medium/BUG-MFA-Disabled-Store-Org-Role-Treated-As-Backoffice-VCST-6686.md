# BUG (VCST-6686): MFA Disabled store: a customer with any organization role is treated as a Backoffice account and is asked for the code in its own store — `[Medium]`

## Status: READY_TO_SUBMIT
**Found by:** agent — testing VCST-6597
**Severity:** Medium. On a B2B store set to Disabled, nearly every B2B buyer holds an org role, so nearly all of them lose the skip once global MFA is on

Env: vcst · Platform 3.1094.0 · VirtoCommerce.MFA 3.1002.0-pr-3-1a0f (vc-module-mfa#3, OPEN, head 1a0f481 — the VCST-6597 build) · Customer 3.1032.0 · theme 2.62.0-pr-2622-caac-caac275a · global `MultiFactorAuthentication.Enabled` = false · checked 2026-11-04 (read-only)
Tracker: https://virtocommerce.atlassian.net/browse/VCST-6686 · Relates VCST-6597, VCST-6530

## Summary
In a store with MFA mode **Disabled**, the code must be skipped for the store's own customers that are not
Backoffice accounts (VCST-6597 comment 112620 / VCST-6530). The module treats any user with at least one
permission as Backoffice, and storefront organization roles carry permissions. As a result, org-role buyers are
classified as Backoffice. **Non-visual claim:** API evidence only, no UI screenshot.

## Steps to reproduce
1. Global MFA off (as on vcst); B2B-store MFA mode = Disabled.
2. Pick B2B-store customers of three kinds: no role; Organization employee or Purchasing agent (`storefront:organization:view`, `storefront:user:view`); Manager.
3. Call `GET /api/mfa/modes/users/{id}/status` (admin token) for each. The README says this endpoint uses the same evaluator as sign-in.
4. Read the B2B-store row's `isDisabledModeSkipped` (`true` = Disabled does not apply, so the user follows the global setting).

## Expected
- Org-role-only customer → `isDisabledModeSkipped` = `false` (not Backoffice).
- `true` only for Administrators, Administrator/Manager user types and users with back-office permissions.
- Or the PO confirms org roles are intended to count as Backoffice, and the README and ticket say so.

## Actual
- Role-less: `false` for 14/14 (correct). Organization employee / Purchasing agent: **`true` for 35/35**. Managers: `true` for 11/11.
- Not exercised live: the `/connect/token` consequence with global MFA on (needs the global switch).

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | N/A | not exercised — server-side classification |
| 2. Backend Admin | N/A | not exercised in the Admin UI |
| 3. GraphQL xAPI | N/A | not on this path |
| 4. Platform REST API | **FAIL** | `GET /api/mfa/modes/users/{id}/status` → `isDisabledModeSkipped: true` for org-role customers |

**Owning layer:** Layer 4 — module service.

## Module Versions
VirtoCommerce.MFA 3.1002.0-pr-3-1a0f (unmerged PR). Need hotfixes: not applicable — the code is in no released stable bundle.

## Root Cause Analysis
`vc-module-mfa@1a0f481` `src/VirtoCommerce.MFA.Data/Services/MfaRequirementService.cs`: `CanSkipCodeInDisabledStoreAsync`
(L157-160) → `IsBackofficeAccountAsync` (L165-183) collects every permission of `user.Roles` and calls
`IAdminUIAccessPolicy.EvaluateAsync`. The default policy counts any user with at least one permission.

## Related
VCST-6597 (feature under test), VCST-6530 (On hold — defines the Disabled rule; this bug is about how org roles are classified) · kb KB-9CE07DBB, KB-1C1755AC.

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 4 — REST (module service)
- **Suggested repo:** VirtoCommerce/vc-module-mfa (the fix belongs in open PR #3)
- **repoKind:** module
- **Ownership hint:** platform
- **Component / module:** MFA — `MfaRequirementService` Disabled-store skip
- **RCA anchor:** `MfaRequirementService.cs` `IsBackofficeAccountAsync` L165-183
- **Routing confidence:** MEDIUM. The fix could instead be in the `IAdminUIAccessPolicy` configuration in vc-platform, and whether this is intended is a PO question. Auto-fix labels withheld.
