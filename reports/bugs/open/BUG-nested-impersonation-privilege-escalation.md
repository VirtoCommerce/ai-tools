# Nested impersonation: an impersonated token can impersonate a third user (privilege escalation) `[P0]` `[Security]`

**Env:** vcst-qa @ 2026-07-15 (store `B2B-store`); root cause code-confirmed on `vc-platform@dev`
**Cases:** IMP-013 (suite 082-auth-impersonation) · BL-AUTH-009

## Summary
`/connect/token` `grant_type=impersonate` does **not** reject a request that is itself issued with an already-impersonated token. A session impersonating User-A — whose own principal has **no** `loginOnBehalf` permission — successfully minted a fresh impersonation token for a different User-B (HTTP 200), with the original operator preserved in the token's operator claim. The storefront does not gate this either (`impersonate.vue` skips the verification form whenever `operator` is set), so the token endpoint was the only line of defense and it is bypassed. Any leaked impersonated token becomes a skeleton key to impersonate any user platform-wide.

## Steps to Reproduce
1. Get an **operator** token: password grant for an account with `CanImpersonate` / `loginOnBehalf` (fixture `agent-test-impersonator`). → `T_OP`.
2. Pick two distinct non-operator users, USR-A and USR-B (USR-A must be a plain customer with **no** `loginOnBehalf` — fixture `AGENT-TEST-nobal`); note their platform userIds.
3. **First impersonation (legit):** `POST /connect/token` with `grant_type=impersonate`, `user_id=<USR-A>`, `Authorization: Bearer T_OP` → HTTP 200, token `T_IMP_A` (sub=A, permission claim `[]`, operator=agent-test-impersonator).
4. **Chained impersonation (the test):** `POST /connect/token` with `grant_type=impersonate`, `user_id=<USR-B>`, `Authorization: Bearer T_IMP_A` (the impersonated token).
5. **Control:** `POST /connect/token` with `grant_type=impersonate`, `user_id=<USR-B>`, using **USR-A's own plain password token**.

## Expected vs Actual
- **Expected:** Step 4 is rejected (4xx `invalid_grant`, no token issued) — an impersonated session must not be able to start a new impersonation. Only the reset-to-operator path (empty `user_id`) may skip the permission check.
- **Actual:** Step 4 returns **HTTP 200** with a valid `access_token` for USR-B (operator claim still = the original operator). The control (step 5) correctly returns **HTTP 403** — same principal (A), same action (impersonate B): **403 on its own token, 200 when the request rides the impersonated token.** That delta is the escalation.

## Impact
Privilege escalation across the impersonation token chain. A support agent's impersonated storefront session (leaked via XSS, logs, referrer, etc.) can pivot to impersonate **any** user — no operator credentials, no `loginOnBehalf` permission — with the operator identity silently carried on every hop. This is an **API-layer defect at the token endpoint**, not a UI bypass. P0: persisted-capability escalation crossing the operator→arbitrary-user trust boundary.

## Root cause (code-confirmed)
`vc-platform` `src/VirtoCommerce.Platform.Web/Controllers/Api/AuthorizationController.cs`, `IsImpersonateGrantType()`:
```csharp
// permission check runs ONLY when the token has no operator claim
if (string.IsNullOrEmpty(User.FindFirstValue(PlatformConstants.Security.Claims.OperatorUserId)))
{
    var loginOnBehalfAuthResult = await _authorizationService.AuthorizeAsync(
        User, null, new PermissionAuthorizationRequirement(PlatformConstants.Security.Permissions.SecurityLoginOnBehalf));
    if (!loginOnBehalfAuthResult.Succeeded)
        return Forbid();
}
```
The `SecurityLoginOnBehalf` check is guarded by `IsNullOrEmpty(OperatorUserId)`, so it is **skipped whenever the presented token already carries an operator claim** — regardless of whether `user_id` is empty (reset to operator) or a new target (retarget). The guard was meant to let an impersonated session reset back to the operator without re-checking permission, but it also lets it retarget to an arbitrary new `user_id`.

## Fix Routing
- **Primary:** `vc-platform` — `AuthorizationController.IsImpersonateGrantType()`. Run the `SecurityLoginOnBehalf` authorization whenever a **non-empty `user_id`** is supplied, regardless of an existing operator claim; only skip it for the empty-`user_id` reset-to-operator path. A green fix: step 4 returns 4xx / no token; the reset-to-operator flow (BL-AUTH-011) still works.
- **Storefront (defense-in-depth, not the fix):** `vc-frontend` `impersonate.vue` `canSkipVerification` cannot see server state and must not be relied on to block this — the enforcement is server-side.
- **Layer:** backend (platform token endpoint). Reproduce at `/connect/token grant_type=impersonate` with a chained token; verify with the control (plain-token 403 vs impersonated-token result).
