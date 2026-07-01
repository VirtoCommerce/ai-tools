# BUG: Org users see a permanent "locked out — contact administrator" message for a temporary (15-min) login lockout

## Status: READY_TO_SUBMIT

**JIRA:** [VCST-5374](https://virtocommerce.atlassian.net/browse/VCST-5374) · Fix PR: [vc-module-customer#303](https://github.com/VirtoCommerce/vc-module-customer/pull/303) (open)

## Verification 2026-06-26 — VERIFIED (pre-merge, on PR build)
Verified live on vcst-qa against deployed PR alpha **VirtoCommerce.Customer `3.1013.0-pr-303-fe3b`**: org user now returns `user_is_temporary_locked_out` / "…temporarily locked. Please try again later." (UI + API), determinism 3/3, permanent-lock path still `user_is_locked_out`, non-org unchanged, lockout still enforced (BL-AUTH-003). Evidence: `tests/Sprint-current/VCST-5374/`. **Move to `fixed/` once PR #303 merges** — not advancing to FIXED/DONE pre-merge.

**Severity:** Medium · **Env:** vcst-qa @ platform `3.1039.0`, Xapi `3.1012.0`, **Customer `3.1011.0`**, storefront `2.52.0-pr-2343` · Lockout policy: 5 attempts / `0:15:0`, `PasswordLogin__DetailedErrors=true`

## Summary
After 5 failed storefront logins, an **organization-member** account receives a correct *temporary* 15-minute lockout server-side, but `/connect/token` returns the **permanent** code `user_is_locked_out` ("Your account has been locked out. Please contact your administrator"; storefront banner: "You have been blocked. You can not reach any information or create the order… contact the site administrator"). A **non-org** user in the identical scenario correctly gets `user_is_temporary_locked_out` ("…try again later"). The lock self-clears in 15 min, so org users are misled into thinking they're permanently blocked and must contact an admin.

## Steps to Reproduce
1. Use an org-member storefront account (e.g. `test-emily.johnson-20260310@test-agent.com`, member of org `6fb516c1…`); ensure unlocked.
2. Go to `{{FRONT_URL}}/sign-in`; submit the correct email with a wrong password **5 times**.
3. Observe the banner after the 5th attempt and the `/connect/token` (attempt 5) response body.

## Expected vs Actual
- **Expected:** Same as a non-org user — `code=user_is_temporary_locked_out`, message conveys a **temporary** lock, because `lockoutEnd` is a ~15-min future time (not `DateTime.MaxValue`).
- **Actual:** `HTTP 400`, `error=invalid_grant`, **`code=user_is_locked_out`**, `errorDescription="Your account has been locked out. Please contact your administrator."`; storefront banner implies a permanent admin-level block.

Verified live: `lockoutEnd` ≈ now+15 min (temporary, **not** MaxValue) and `contact.Status="Approved"` (so this is **not** an org-admin block). Evidence: `reports/bugs/screenshots/` → `storefront-org-user-locked-message.png`.

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | FAIL (inherited) | Banner "You have been blocked…"; renders the backend code, doesn't originate it |
| 2. Backend Admin | N/A | Admin login (`/api/platform/security/login`) doesn't run the xAPI/customer token validators |
| 3. GraphQL xAPI | N/A | Failure is on the `/connect/token` OpenIddict pipeline, not GraphQL |
| 4. Token endpoint (`/connect/token`, OpenIddict) | **FAIL** | Attempt 5 body: `code=user_is_locked_out` for a temporary lock; non-org control returns `user_is_temporary_locked_out` |

**Owning layer:** token/auth pipeline (`/connect/token`) — `repoKind=module`, repo `vc-module-customer`.

## Root Cause Analysis
The OpenIddict token-request validators run priority-ordered; first non-empty result wins.

`vc-module-customer@3.1011.0` → `src/VirtoCommerce.CustomerModule.Data/OpenIddict/OrganizationIdRequestValidator.cs` (Priority **50**) runs whenever an org id resolves (any org member). Its first check:
```csharp
// Global lock has the highest priority …
if (context.User != null && IsGloballyLocked(context.User))
{
    return [ErrorDescriber.UserIsLockedOut()];   // code "user_is_locked_out"
}

private static bool IsGloballyLocked(ApplicationUser user) =>
    user.LockoutEnabled
    && user.LockoutEnd.HasValue
    && user.LockoutEnd.Value > DateTimeOffset.UtcNow;   // ← fires for ANY active lock (temp OR permanent)
```
`IsGloballyLocked` does **not** distinguish a temporary lock from a permanent one (the platform's `BaseUserSignInValidator` does, via `LockoutEnd == DateTime.MaxValue`). So any temporary failed-attempt lock on an org member yields the permanent-worded `ErrorDescriber.UserIsLockedOut()` ("…contact your administrator." — exact live match). The error fires at Priority 50, ahead of the platform `BaseUserSignInValidator` (Priority 0) that would have returned `user_is_temporary_locked_out`. Non-org users resolve no org id → this validator returns `[]` → the platform validator correctly emits the temporary code.

Not the org-block path (`user_is_locked_in_organization`, BL-AUTH-013 / VCST-5028) — different branch (`membership.IsCurrentlyLocked`); `contact.Status` stayed `Approved`.

**Suggested fix:** gate the `UserIsLockedOut()` branch on `LockoutEnd == DateTime.MaxValue` (true permanent lock); for a temporary lock return `[]` (defer to `BaseUserSignInValidator`) or add a `UserIsTemporaryLockedOut()` to the customer `ErrorDescriber`. ~3-line change, single repo.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 4 — token/auth (`/connect/token` OpenIddict validator chain)
- **Suggested repo:** VirtoCommerce/vc-module-customer
- **repoKind:** module
- **Component / module:** Customer — `OrganizationIdRequestValidator` (OpenIddict token-request validator)
- **RCA anchor:** `src/VirtoCommerce.CustomerModule.Data/OpenIddict/OrganizationIdRequestValidator.cs` → `IsGloballyLocked()` + the `UserIsLockedOut()` branch (deployed tag `3.1011.0`)
- **Routing confidence:** HIGH (exact deployed source confirmed; strings match live response verbatim)
