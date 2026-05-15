# BUG-IMP-049: Platform `/connect/token grant_type=impersonate` Has No Status Gate — Locked & Invited Users Can Be Impersonated at API Level

## Status: READY_TO_SUBMIT

**Severity:** High
**Priority:** P1
**Category:** Security / Authorization / OAuth2
**Component:** Backend (Platform / OpenIddict pipeline)
**Owning layer:** **Layer 4 (Platform — `AuthorizationController.Exchange()` `IsImpersonateGrantType` branch)**
**Environment:** vcst-qa
**Verified:** 2026-05-14 — playwright-edge — confirmed reproducible against current deploy

---

## Build / Environment under test

| Field | Value |
|---|---|
| FRONT_URL | `https://vcst-qa-storefront.govirto.com` |
| BACK_URL | `https://vcst-qa.govirto.com` |
| Platform | `3.1026.0` |
| Theme | `vc-theme-b2b-vue-2.49.0-pr-2280-8069-80690ef2` (PR #2280 head `80690ef2`) |
| OpenIdConnectModule | `VirtoCommerce.OpenIdConnectModule 3.1000.0` (prime suspect) |
| Health | `/health` → Healthy |

## Operator + targets (resolved via test-data/aliases.json)

| Role | Alias | Identity | State |
|---|---|---|---|
| Operator | `SUPPORT_AGENT` (USR-001) | John Mitchell — `test-john.mitchell-20260310@test-agent.com` — `143bc845-7ba3-4982-ae9a-a9446a399705` | Active; role grants `platform:security:loginOnBehalf` |
| Target A | `IMPERSONATE_TARGET_BLOCKED` (USR-021) | `AGENT-TEST-imp-target-blocked-20260514@test-agent.com` — `3133b984-8e81-40bd-b2b3-847346ee3f4f` | **Locked** (`lockoutEnd=9999-12-31T23:59:59.9999999+00:00`, `lockoutEnabled=true`, `/api/platform/security/users/{id}/locked → {locked:true}`) |
| Target B | `IMPERSONATE_TARGET_INVITED` (USR-022) | `AGENT-TEST-imp-target-invited-20260514@test-agent.com` — `fa945873-f304-4d1f-a66b-1494e697b98f` | **Invited** (`emailConfirmed=false`, sendVerificationEmail issued + never clicked) |

Credentials resolved from `process.env` at run time. No hardcoded passwords.

---

## Summary

Direct REST `POST /connect/token` with `grant_type=impersonate` returns HTTP 200 + a valid 30-minute Bearer token regardless of the target user's account state. The platform OAuth endpoint does NOT check `LockoutEnd`/`LockoutEnabled`/`EmailConfirmed` on the impersonated user before minting the token. Defense-in-depth (the storefront's `/blocked` redirect for Locked targets) is **frontend-only** and is completely bypassed by direct REST callers — Postman, curl, a malicious server-side script, or any compromised operator account using the same operator's existing Bearer.

The minted token is also accepted by the storefront xAPI `/graphql { me }` resolver and returns the Locked/Invited target's full identity (id, userName, email, contact firstName/lastName, organizationId). This means **Layer 3 (xAPI) also has no per-request user-state revalidation** — once the JWT is signed, downstream APIs trust it unconditionally for its `exp` lifetime.

This violates BL-AUTH-005 (RBAC enforcement at the boundary where the token is issued, not just at the UI consumption layer) and the spirit of BL-AUTH-006 (impersonation session scope). The fix lives at the platform OAuth `IsImpersonateGrantType` branch, which is mode-specific and isolated to ~50 lines of code.

---

## Layer Validation

| Layer | Expected | Actual | Result |
|---|---|---|---|
| 1 — Storefront UI | Locked target → `/blocked` redirect, banner suppressed; Invited target → behavior per policy | Locked target: `/blocked` shown (frontend mitigation works for UI route). Invited target: **silent success**, lands on `/` with operator chip + revert button (NO gate) | **PARTIAL** — Locked caught by `/blocked` redirect (defense-in-depth); Invited has no UI gate |
| 2 — Admin SPA | Admin SPA correctly reflects user state | USR-021 shows Locked, USR-022 shows `emailConfirmed=false` | **PASS** (state is correctly stored — not the issue) |
| 3 — GraphQL xAPI | `POST /graphql { me { id userName email contact { firstName lastName organizationId } } }` with a Bearer minted for a Locked user → HTTP 401 / `errors: [{ unauthorized }]` | **HTTP 200** + Blocked target's full identity (`id=3133b984-...`, `userName=AGENT-TEST-imp-target-blocked-...`, `contact={firstName:"Blocked", lastName:"User", organizationId:"6fb516c1-..."}`) | **FAIL** |
| 4 — Platform REST `/connect/token grant_type=impersonate` | HTTP 4xx (`invalid_grant` / `user_locked` / `email_unconfirmed`) when target is Locked / Invited | **HTTP 200** for BOTH Locked and Invited; response includes `access_token` + `refresh_token`; minted JWT has `sub=target`, `vc_operator_user_id=operator`, 1800-second TTL, full `offline_access` scope, `role=__customer` | **FAIL (root cause)** |

**Smoking gun pairing:** Layer 4 mints the token without checking target state; Layer 3 doesn't re-check. Layer 1 mitigates Locked via a downstream redirect, but is bypassable by any non-browser caller and provides no gate for Invited.

---

## Steps to Reproduce

### Repro 1 — REST only (the security-relevant path)

1. Sign in via storefront as `SUPPORT_AGENT` (so the operator's Bearer is in `localStorage["auth"]`). Capture as `T_op`.
2. From any HTTP client (Postman, curl, or — for ease — the browser console using `fetch()`), POST to `{BACK_URL}/connect/token` or `{FRONT_URL}/connect/token` (storefront origin proxies to the same backend):
   ```http
   POST /connect/token HTTP/1.1
   Authorization: Bearer <T_op>
   Content-Type: application/x-www-form-urlencoded

   grant_type=impersonate&scope=offline_access&user_id=3133b984-8e81-40bd-b2b3-847346ee3f4f
   ```
3. Response: **HTTP 200** + `{ access_token, token_type:"Bearer", expires_in:1800, refresh_token }`.
4. Decoded `access_token` claims (re-verified 2026-05-14):
   - `sub = 3133b984-8e81-40bd-b2b3-847346ee3f4f` (the Blocked user)
   - `name = AGENT-TEST-imp-target-blocked-20260514@test-agent.com`
   - `email = AGENT-TEST-imp-target-blocked-20260514@test-agent.com`
   - `vc_operator_user_id = 143bc845-7ba3-4982-ae9a-a9446a399705` (the operator, audit trail preserved)
   - `vc_operator_name = test-john.mitchell-20260310@test-agent.com`
   - `exp - iat = 1800` seconds (30-min usable Bearer)
   - `scope = "offline_access"`
   - `role = "__customer"`
   - `organization_id = "6fb516c1-..."` (TechFlow)
   - `memberId = "bba54613-43ff-4ae8-9311-dd4af9d7f73b"`
   - `jti, oi_tkn_id, oi_au_id` — unique per issuance
5. Repeat step 2 with `user_id=fa945873-f304-4d1f-a66b-1494e697b98f` (Invited target) → also HTTP 200, equivalent payload with `sub=fa945873-...`. The platform issues the token despite `emailConfirmed=false`.
6. Now exercise the minted token against the storefront xAPI:
   ```http
   POST /graphql HTTP/1.1
   Authorization: Bearer <impersonation_token_for_locked_target>
   Content-Type: application/json

   { "query": "{ me { id userName email contact { firstName lastName organizationId } } }" }
   ```
7. Response: **HTTP 200**, `data.me = { id: "3133b984-...", userName: "AGENT-TEST-imp-target-blocked-...", contact: { firstName: "Blocked", lastName: "User", organizationId: "6fb516c1-..." } }`. The Locked user's full identity is exposed.

### Repro 2 — UI path (verifies the asymmetry)

1. Sign in as `SUPPORT_AGENT`.
2. Navigate to `{FRONT_URL}/account/impersonate/3133b984-8e81-40bd-b2b3-847346ee3f4f` (Locked target).
3. Frontend's downstream Locked-status detection fires — page redirects to `/blocked` (heading "Your account is blocked"); `auth.access_token` is wiped from localStorage; operator session also wiped (see related qa-testing-expert bug IMP-049-BUG-2).
4. Navigate to `{FRONT_URL}/account/impersonate/fa945873-f304-4d1f-a66b-1494e697b98f` (Invited target).
5. Silent success: redirects to `/`, operator chip + "Back to John Mitchell" revert button visible in header. Operator can fully act as the Invited user — including placing orders, modifying address book, etc.

### Expected

Repro 1 step 3 and step 5 should return HTTP 4xx (`invalid_grant` with `error_description` like `"user_locked"` or `"email_unconfirmed"` — depending on the desired contract for Invited). Repro 1 step 7 should return HTTP 401 or GraphQL `errors[]`.

### Actual

All three (Locked mint, Invited mint, GraphQL replay with Locked token) succeed with HTTP 200 and valid payloads. The platform has no status-based gate at the token issuance boundary, and xAPI does not re-validate.

---

## Evidence

All under `tests/Sprint-current/VCST-4906/evidence/bug-verification-security/`:

| File | Content |
|---|---|
| `imp-049-bug-1-platform-no-status-gate-2026-05-14.json` | Full repro evidence package: both targets' `POST /connect/token` responses (status 200, decoded JWT claims), `xapi_graphql_me_probe` showing the Locked-target token returns full identity from `{ me }`, environment fingerprint (Platform 3.1026.0, theme PR #2280 head `80690ef2`, OpenIdConnectModule 3.1000.0) |

Prior session evidence (preserved verbatim):
- `tests/Sprint-current/VCST-4906/evidence/imp-049/part-a-token-request-body.txt` + `part-a-token-response-body.json` — Firefox-session token mint for Locked target
- `tests/Sprint-current/VCST-4906/evidence/imp-049/part-b-token-request-body.txt` + `part-b-token-response-body.json` — same for Invited target
- `tests/Sprint-current/VCST-4906/evidence/imp-049/rest-cross-check.json` — Firefox-session direct REST cross-check confirming 200 for both targets
- `tests/Sprint-current/VCST-4906/evidence/imp-049/part-a-blocked-final-ui.png` — `/blocked` page (Layer 1 mitigation, UI-only)
- `tests/Sprint-current/VCST-4906/evidence/imp-049/part-b-invited-account-menu-with-revert.png` — Invited-target session with revert button visible
- `tests/Sprint-current/VCST-4906/test-execution-report-imp-049.md` — full IMP-049 contract lock-in report including the security analysis that motivated this bug

---

## Root Cause Analysis

### Smoking gun — `AuthorizationController.Exchange()` `IsImpersonateGrantType` branch

[`src/VirtoCommerce.Platform.Web/Controllers/Api/AuthorizationController.cs`](https://github.com/VirtoCommerce/vc-platform/blob/dev/src/VirtoCommerce.Platform.Web/Controllers/Api/AuthorizationController.cs) @ sha `67ff59989ac0c65e209aac9feb442f0f9a4434b6` (branch `dev`), lines ~257-310:

```csharp
if (openIdConnectRequest.IsImpersonateGrantType())
{
    // Only Authorized User has access for impersonation
    var user = await _userManager.GetUserAsync(User);
    if (user == null) {
        return Unauthorized();
    }

    // Check if user has permission for login on behalf
    if (string.IsNullOrEmpty(User.FindFirstValue(PlatformConstants.Security.Claims.OperatorUserId)))
    {
        var loginOnBehalfAuthResult = await _authorizationService.AuthorizeAsync(User, null,
            new PermissionAuthorizationRequirement(PlatformConstants.Security.Permissions.SecurityLoginOnBehalf));
        if (!loginOnBehalfAuthResult.Succeeded) {
            return Forbid();
        }
    }

    // Resolve Impersonator from claims or from current user
    var operatorUserId = User.FindFirstValue(PlatformConstants.Security.Claims.OperatorUserId)?.EmptyToNull() ?? user.Id;
    var operatorUserName = User.FindFirstValue(PlatformConstants.Security.Claims.OperatorUserName)?.EmptyToNull() ?? user.UserName;

    var userId = (string)openIdConnectRequest.GetParameter("user_id");
    ApplicationUser impersonatedUser;

    if (!string.IsNullOrEmpty(userId)) {
        // Find impersonated user by id
        impersonatedUser = await _userManager.FindByIdAsync(userId);
    } else {
        // Reset impersonation to operator
        impersonatedUser = await _userManager.FindByIdAsync(operatorUserId);
        operatorUserId = string.Empty;
        operatorUserName = string.Empty;
    }

    if (impersonatedUser == null) {
        return BadRequest(SecurityErrorDescriber.TokenInvalid());
    }

    context.User = impersonatedUser.CloneTyped();

    // _requestValidators loop runs but does not gate on target lockout state
    foreach (var requestValidator in _requestValidators) { ... }

    await HandleTokenRequest(impersonatedUser, context);
    var ticket = await CreateTicketAsync(impersonatedUser, context);
    // ... claims + SignIn (200 OK with token)
    return SignIn(ticket.Principal, ticket.Properties, ticket.AuthenticationScheme);
}
```

**The gaps:**

1. **NO call to `_signInManager.CanSignInAsync(impersonatedUser)`.** Compare with the refresh-token grant ~50 lines above (line ~207):
   ```csharp
   // Ensure the user is still allowed to sign in.
   if (!await _signInManager.CanSignInAsync(user)) {
       return BadRequest(SecurityErrorDescriber.SignInNotAllowed());
   }
   ```
   This identical guard is missing from the impersonate path. `CanSignInAsync` is precisely the ASP.NET Core Identity method that checks `LockoutEnd`, `LockoutEnabled`, and (with the right `SignInOptions.RequireConfirmedEmail`) `EmailConfirmed`.

2. **NO call to `_userManager.IsLockedOutAsync(impersonatedUser)`** or any direct check on `impersonatedUser.LockoutEnd`/`LockoutEnabled`.

3. **NO call to `_userManager.IsEmailConfirmedAsync(impersonatedUser)`.**

4. **`_requestValidators` is the only extensibility hook.** It runs (line ~286), but a `grep` of vc-platform for `ITokenRequestValidator` implementations shows no validator that gates on target-user lockout/email state. There may be a module that *could* implement one, but no shipped validator does so for the impersonate path.

5. **`SecurityErrorDescriber.SignInNotAllowed()` exists** and is used by the refresh-token path. The impersonate path could trivially reuse it.

### Confirmed via GitHub MCP code search

- `repo:VirtoCommerce/vc-platform CanSignInAsync impersonate` → 1 result, the same `AuthorizationController.cs` file (the *missing* guard match — search finds the `CanSignInAsync` calls in OTHER grants on the same page; no result inside the impersonate block).
- `repo:VirtoCommerce/vc-platform LockoutEnd EmailConfirmed impersonate` → **0 results**. There is no code anywhere that gates impersonation on these fields.

---

## App Insights query — DEFERRED

Per `memory_azure_application_insights`, vcst-qa App Insights is likely classic (not workspace-based) — not queryable via the `vcst-devtraining-law` Log Analytics workspace. A future verification should run, in the classic AI Logs pane:

```kql
requests
| where timestamp >= ago(24h)
| where url contains "/connect/token"
| extend body = parse_url(url)
| where customDimensions.grant_type == "impersonate" or operation_Name contains "impersonate"
| summarize count() by resultCode
```

Expected: zero 4xx responses for the impersonate grant — confirming the platform never rejects regardless of target state. Browser-level evidence above is sufficient to file; this query is supplementary.

---

## Suggested Fix

### Recommended

Add a `CanSignInAsync` gate (and any module-specific extension) to the impersonate branch in `AuthorizationController.cs`, after `_userManager.FindByIdAsync(userId)` succeeds and before `await HandleTokenRequest(...)`:

```csharp
if (impersonatedUser == null) {
    return BadRequest(SecurityErrorDescriber.TokenInvalid());
}

// NEW — gate on target's sign-in eligibility
if (!await _signInManager.CanSignInAsync(impersonatedUser)) {
    return BadRequest(SecurityErrorDescriber.SignInNotAllowed());
}

// Optional, more granular — depends on policy decision:
// if (await _userManager.IsLockedOutAsync(impersonatedUser)) {
//     return BadRequest(SecurityErrorDescriber.UserLocked());
// }
// if (!await _userManager.IsEmailConfirmedAsync(impersonatedUser)) {
//     return BadRequest(SecurityErrorDescriber.EmailUnconfirmed());
// }

context.User = impersonatedUser.CloneTyped();
```

Choice between the broad `CanSignInAsync` and the granular `IsLockedOutAsync`/`IsEmailConfirmedAsync` calls is a product decision:
- `CanSignInAsync` is the simplest and matches the refresh-token grant's existing guard — preferred for consistency.
- The granular pair allows distinct error messages (`user_locked` vs `email_unconfirmed`) which is useful for support tooling.

### Defense-in-depth recommendation for Layer 3 (xAPI)

The fact that xAPI `me` returns Locked users' full identity 30 minutes after the lock was applied (within token TTL) is a separate concern. Consider adding a per-request `_signInManager.CanSignInAsync(user)` check at the xAPI authentication middleware level — or shortening token TTL — so server-side state changes propagate within a bounded window. This is broader than VCST-4906 scope.

### Product decision needed for `emailConfirmed=false`

The current contract permits impersonating Invited (email-unverified) users. This may be a legitimate support workflow (verifying that a buyer's invitation works correctly), or it may be a vector for an operator to silently accept an organizational invitation on a buyer's behalf and skew customer-onboarding telemetry. Flag to product owner. If the answer is "should be blocked", the `CanSignInAsync` gate above only catches it if `SignInOptions.RequireConfirmedEmail = true` is configured — otherwise add the explicit `IsEmailConfirmedAsync` check.

---

## Acceptance Criteria for Fix Verification

When the fix ships, re-run IMP-049 from `regression/suites/Frontend/auth/082-auth-impersonation.csv`:

- [ ] `POST /connect/token grant_type=impersonate user_id=<Locked-user-id>` → HTTP 400 (`invalid_grant` / `SignInNotAllowed` / `user_locked`)
- [ ] `POST /connect/token grant_type=impersonate user_id=<Invited-user-id>` → HTTP 400 (or 200 if product confirms "by design") — per product decision
- [ ] `POST /connect/token grant_type=impersonate user_id=<Active-user-id>` → continues to return HTTP 200 (regression-safe)
- [ ] No new attack surface: operator without `platform:security:loginOnBehalf` still gets 403 (existing guard unaffected)
- [ ] Frontend `/account/impersonate/{locked}` no longer needs to wipe operator session — backend rejection means no token is ever issued and the operator's session stays intact (this closes IMP-049-BUG-2 indirectly)
- [ ] IMP-049 row in `regression/suites/Frontend/auth/082-auth-impersonation.csv` is updated to assert HTTP 400 for both Locked + Invited contracts (currently locked at HTTP 200 per `_meta.changelog_1_4_6` in `test-data/aliases.json`)

---

## Related bugs

| Bug | Owning layer | Domain | Notes |
|---|---|---|---|
| `BUG-IMP-046-stale-impersonation-token-replay-VCST-4906.md` | Platform + Frontend | OAuth2 / token revocation | Sibling P0. Same OpenIddict pipeline. Different attack vector (token replay after revert). Same conceptual gap — server-side does not gate on user state at request time. If the platform adds JTI denylist (BUG_032_057 fix) AND adds the `CanSignInAsync` gate from THIS bug, both are mitigated. |
| IMP-049-BUG-2 (operator session destroyed by Blocked-target impersonation) | Frontend (`useImpersonate.ts` / `useUser.ts`) | UX / session restoration | **Frontend-owned, NOT in this report's scope.** Being handled in parallel by qa-testing-expert. Path: `tests/Sprint-current/VCST-4906/test-execution-report-imp-049.md` §6 BUG-2. Closing the present bug (rejecting the impersonate grant at Layer 4 for Locked targets) makes IMP-049-BUG-2 unreachable in practice — operator's session stays intact because no Blocked-target token is ever issued and no `/blocked` redirect ever fires. Frontend should still be hardened to handle the case where a manually-crafted impersonation URL points at a non-existent / un-grantable target, but the urgency drops once Layer 4 is fixed. |
| IMP-049-BUG-3 (product question: should Invited users be impersonable?) | Product | — | Lock-in note in IMP-049 report §6 BUG-3. Resolution determines whether the `CanSignInAsync` gate in this bug is sufficient or if an explicit `IsEmailConfirmedAsync` gate is also needed. |
| `BUG_032_057-access-token-revocation.md` | Platform | OAuth2 | Parent design defect — stateless JWT validation means no token-revocation path works. Tracks the underlying mechanism. |

---

## References

- **JIRA Parent:** [VCST-4906 — Login On Behalf for Company Employee](https://virtocommerce.atlassian.net/browse/VCST-4906)
- **JIRA Epic:** VCST-4903
- **PR under test:** [VirtoCommerce/vc-frontend#2280](https://github.com/VirtoCommerce/vc-frontend/pull/2280) (head `80690ef2`) — frontend feature delivery
- **Source file with the gap:** [`vc-platform / src/VirtoCommerce.Platform.Web/Controllers/Api/AuthorizationController.cs`](https://github.com/VirtoCommerce/vc-platform/blob/dev/src/VirtoCommerce.Platform.Web/Controllers/Api/AuthorizationController.cs) @ branch `dev` (sha `67ff59989ac0c65e209aac9feb442f0f9a4434b6`) — `IsImpersonateGrantType` branch lines ~257-310
- **Related module:** `VirtoCommerce.OpenIdConnectModule 3.1000.0` (named in deploy artifact — confirms OpenIddict pipeline ownership)
- **Test case:** `regression/suites/Frontend/auth/082-auth-impersonation.csv` IMP-049 — currently locked at HTTP 200 contract per `_meta.changelog_1_4_6` in `test-data/aliases.json`
- **Lock-in report:** `tests/Sprint-current/VCST-4906/test-execution-report-imp-049.md` (Verdict: PASS_WITH_NOTES — three bugs surfaced)
- **Business rules:** BL-AUTH-005 (RBAC at boundary where token is issued), BL-AUTH-006 (impersonation session scope), BL-AUTH-007 (impersonation session boundary)
- **Edge case:** ECL-14.1 (impersonation security exit)
- **Suggested JIRA filing:**
  - Project: VCST · Issue type: Bug · Priority: P1/High
  - Labels: `security`, `authentication`, `impersonation`, `oauth2`, `login-on-behalf`, `vcst-4906`, `openiddict`
  - Components: vc-platform-security, vc-module-openidconnect
  - Links: relates-to → VCST-4906; sibling → BUG-IMP-046-stale-impersonation-token-replay-VCST-4906; relates-to → BUG_032_057
