# Investigation — BUG-IMP-049 Impersonate-Grant No Status Gate (VCST-4906)

Companion to [BUG-IMP-049-impersonate-grant-no-status-gate-VCST-4906.md](BUG-IMP-049-impersonate-grant-no-status-gate-VCST-4906.md). Holds Layer Validation matrix, full `Exchange()` impersonate-branch code, GitHub MCP code-search results, App Insights query plan, acceptance criteria, related-bugs map, references — extracted to comply with the 150-line cap in `.claude/rules/reports.md`.

## Layer Validation

| Layer | Expected | Actual | Result |
|---|---|---|---|
| 1 — Storefront UI | Locked → `/blocked`; Invited → behavior per policy | Locked: `/blocked` shown (frontend mitigation). Invited: **silent success**, lands on `/` with operator chip + revert (NO gate) | **PARTIAL** — Locked caught by `/blocked`; Invited has no gate |
| 2 — Admin SPA | Admin SPA reflects user state | USR-021 Locked, USR-022 `emailConfirmed=false` | **PASS** (state correctly stored — not the issue) |
| 3 — GraphQL xAPI | `me` w/ Locked-user Bearer → 401 / `errors[]` | **200** + Blocked target's full identity (`id=3133b984-…`, `firstName=Blocked`, `lastName=User`, `organizationId=6fb516c1-…`) | **FAIL** |
| 4 — Platform REST `/connect/token` | 4xx (`invalid_grant`/`user_locked`/`email_unconfirmed`) | **200** for both Locked + Invited; minted JWT has `sub=target`, `vc_operator_user_id=operator`, 1800-s TTL, `offline_access`, `role=__customer` | **FAIL (root cause)** |

## Smoking Gun — `Exchange()` Impersonate Branch

`src/VirtoCommerce.Platform.Web/Controllers/Api/AuthorizationController.cs` @ sha `67ff59989ac0c65e209aac9feb442f0f9a4434b6` (branch `dev`), lines ~257-310:

```csharp
if (openIdConnectRequest.IsImpersonateGrantType())
{
    // Only Authorized User has access for impersonation
    var user = await _userManager.GetUserAsync(User);
    if (user == null) return Unauthorized();

    // Check if user has permission for login on behalf
    if (string.IsNullOrEmpty(User.FindFirstValue(PlatformConstants.Security.Claims.OperatorUserId))) {
        var loginOnBehalfAuthResult = await _authorizationService.AuthorizeAsync(User, null,
            new PermissionAuthorizationRequirement(PlatformConstants.Security.Permissions.SecurityLoginOnBehalf));
        if (!loginOnBehalfAuthResult.Succeeded) return Forbid();
    }

    // Resolve Impersonator from claims or from current user
    var operatorUserId = User.FindFirstValue(PlatformConstants.Security.Claims.OperatorUserId)?.EmptyToNull() ?? user.Id;
    var operatorUserName = User.FindFirstValue(PlatformConstants.Security.Claims.OperatorUserName)?.EmptyToNull() ?? user.UserName;

    var userId = (string)openIdConnectRequest.GetParameter("user_id");
    ApplicationUser impersonatedUser;
    if (!string.IsNullOrEmpty(userId)) {
        impersonatedUser = await _userManager.FindByIdAsync(userId);
    } else {
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
    // … claims + SignIn (200 OK with token)
    return SignIn(ticket.Principal, ticket.Properties, ticket.AuthenticationScheme);
}
```

## The Gaps

1. **No `_signInManager.CanSignInAsync(impersonatedUser)`.** Compare refresh-token grant ~50 lines above (line ~207):
   ```csharp
   // Ensure the user is still allowed to sign in.
   if (!await _signInManager.CanSignInAsync(user)) {
       return BadRequest(SecurityErrorDescriber.SignInNotAllowed());
   }
   ```
   Identical guard is missing from impersonate. `CanSignInAsync` is the ASP.NET Core Identity method that checks `LockoutEnd`, `LockoutEnabled`, and (with `SignInOptions.RequireConfirmedEmail`) `EmailConfirmed`.
2. **No `_userManager.IsLockedOutAsync(impersonatedUser)`** or direct `LockoutEnd` / `LockoutEnabled` check.
3. **No `_userManager.IsEmailConfirmedAsync(impersonatedUser)`** check.
4. **`_requestValidators` is the only extensibility hook.** It runs (~L286), but `grep` of vc-platform for `ITokenRequestValidator` implementations shows no validator that gates on target-user state for the impersonate path.
5. **`SecurityErrorDescriber.SignInNotAllowed()` already exists** and is used by the refresh-token path. The impersonate path could trivially reuse it.

## GitHub MCP Code-Search Confirmation

- `repo:VirtoCommerce/vc-platform CanSignInAsync impersonate` → 1 result, the same `AuthorizationController.cs` file (matches the `CanSignInAsync` calls in OTHER grants on the same page; **no result inside the impersonate block**).
- `repo:VirtoCommerce/vc-platform LockoutEnd EmailConfirmed impersonate` → **0 results.** No code anywhere gates impersonation on these fields.

## App Insights — DEFERRED

Per `memory_azure_application_insights`, vcst-qa AI is likely classic (NOT workspace-based) — not queryable via `vcst-devtraining-law`. Future verification, in classic AI Logs pane:

```kql
requests
| where timestamp >= ago(24h)
| where url contains "/connect/token"
| extend body = parse_url(url)
| where customDimensions.grant_type == "impersonate" or operation_Name contains "impersonate"
| summarize count() by resultCode
```

Expected: zero 4xx responses for impersonate grant — confirms platform never rejects regardless of target state. Browser-level evidence is sufficient to file; this is supplementary.

## Recommended Fix Detail

### Primary

```csharp
if (impersonatedUser == null) {
    return BadRequest(SecurityErrorDescriber.TokenInvalid());
}

// NEW — gate on target's sign-in eligibility
if (!await _signInManager.CanSignInAsync(impersonatedUser)) {
    return BadRequest(SecurityErrorDescriber.SignInNotAllowed());
}

// Optional, more granular — depends on policy:
// if (await _userManager.IsLockedOutAsync(impersonatedUser)) {
//     return BadRequest(SecurityErrorDescriber.UserLocked());
// }
// if (!await _userManager.IsEmailConfirmedAsync(impersonatedUser)) {
//     return BadRequest(SecurityErrorDescriber.EmailUnconfirmed());
// }

context.User = impersonatedUser.CloneTyped();
```

Choice between broad `CanSignInAsync` and granular `IsLockedOutAsync`/`IsEmailConfirmedAsync` is a product decision:

- `CanSignInAsync` — simplest, matches refresh-token grant's existing guard. **Preferred for consistency.**
- Granular pair — distinct error messages (`user_locked` vs `email_unconfirmed`), useful for support tooling.

### Defense-in-depth at Layer 3 (xAPI)

xAPI `me` returns Locked users' full identity 30 min after lock applied (within token TTL). Add per-request `_signInManager.CanSignInAsync(user)` at the xAPI auth middleware — or shorten token TTL — so server-side state changes propagate within bounded window. Broader than VCST-4906 scope.

### Product Decision Needed — `emailConfirmed=false`

Current contract permits impersonating Invited (email-unverified) users. May be legitimate support workflow (verifying a buyer's invitation works correctly), or a vector for an operator to silently accept an organizational invitation on a buyer's behalf and skew customer-onboarding telemetry. **Flag to product owner.** If answer is "should be blocked", the `CanSignInAsync` gate only catches it if `SignInOptions.RequireConfirmedEmail = true` is configured — otherwise add explicit `IsEmailConfirmedAsync` check.

## Acceptance Criteria for Fix Verification

Re-run IMP-049 from `regression/suites/Frontend/auth/082-auth-impersonation.csv`:

- [ ] `POST /connect/token grant_type=impersonate user_id=<Locked-user-id>` → HTTP 400 (`invalid_grant` / `SignInNotAllowed` / `user_locked`)
- [ ] `POST /connect/token grant_type=impersonate user_id=<Invited-user-id>` → HTTP 400 (or 200 if product confirms "by design") — per product decision
- [ ] `POST /connect/token grant_type=impersonate user_id=<Active-user-id>` → continues to return 200 (regression-safe)
- [ ] No new attack surface: operator without `platform:security:loginOnBehalf` still gets 403 (existing guard unaffected)
- [ ] Frontend `/account/impersonate/{locked}` no longer needs to wipe operator session — backend rejection means no token is ever issued and the operator's session stays intact (closes IMP-049-BUG-2 indirectly)
- [ ] IMP-049 row in `082-auth-impersonation.csv` updated to assert 400 for both Locked + Invited (currently locked at 200 per `_meta.changelog_1_4_6` in `test-data/aliases.json`)

## Related Bugs

| Bug | Owning Layer | Domain | Notes |
|---|---|---|---|
| `BUG-IMP-046-stale-impersonation-token-replay-VCST-4906.md` | Platform + Frontend | OAuth2 / token revocation | Sibling P0. Same OpenIddict pipeline. Different vector (token replay after revert). Same conceptual gap — server-side does not gate on user state at request time. JTI denylist (BUG_032_057 fix) + `CanSignInAsync` gate from THIS bug mitigates both. |
| IMP-049-BUG-2 (operator session destroyed by Blocked-target impersonation) | Frontend (`useImpersonate.ts` / `useUser.ts`) | UX / session restoration | **Frontend-owned, not in this report's scope.** Handled in parallel by qa-testing-expert. Path: `tests/Sprint-current/VCST-4906/test-execution-report-imp-049.md` §6 BUG-2. Closing the present bug (rejecting impersonate at Layer 4 for Locked targets) makes BUG-2 unreachable in practice — operator's session stays intact because no Blocked-target token is ever issued and no `/blocked` redirect ever fires. Frontend should still be hardened against manually-crafted impersonation URLs pointing at non-existent/un-grantable targets, but urgency drops once Layer 4 is fixed. |
| IMP-049-BUG-3 (product question: should Invited users be impersonable?) | Product | — | Lock-in note in IMP-049 report §6 BUG-3. Resolution determines whether `CanSignInAsync` gate alone is sufficient or if explicit `IsEmailConfirmedAsync` gate is also needed. |
| `BUG_032_057-access-token-revocation.md` | Platform | OAuth2 | Parent design defect — stateless JWT validation means no token-revocation path works. |

## References

- **JIRA Parent:** [VCST-4906 — Login On Behalf for Company Employee](https://virtocommerce.atlassian.net/browse/VCST-4906)
- **JIRA Epic:** VCST-4903
- **PR under test:** [VirtoCommerce/vc-frontend#2280](https://github.com/VirtoCommerce/vc-frontend/pull/2280) (head `80690ef2`) — frontend feature delivery
- **Source file with the gap:** [`vc-platform/.../AuthorizationController.cs`](https://github.com/VirtoCommerce/vc-platform/blob/dev/src/VirtoCommerce.Platform.Web/Controllers/Api/AuthorizationController.cs) @ branch `dev` sha `67ff59989ac0c65e209aac9feb442f0f9a4434b6` — `IsImpersonateGrantType` branch ~L257-310
- **Related module:** `VirtoCommerce.OpenIdConnectModule 3.1000.0` (named in deploy artifact — confirms OpenIddict pipeline ownership)
- **Test case:** `regression/suites/Frontend/auth/082-auth-impersonation.csv` IMP-049 — currently locked at HTTP 200 contract per `_meta.changelog_1_4_6` in `test-data/aliases.json`
- **Lock-in report:** `tests/Sprint-current/VCST-4906/test-execution-report-imp-049.md` (Verdict: PASS_WITH_NOTES — three bugs surfaced)
- **Business rules:** BL-AUTH-005, BL-AUTH-006, BL-AUTH-007
- **Edge case:** ECL-14.1

## Suggested JIRA Filing

- Project: VCST · Issue type: Bug · Priority: P1/High
- Labels: `security`, `authentication`, `impersonation`, `oauth2`, `login-on-behalf`, `vcst-4906`, `openiddict`
- Components: vc-platform-security, vc-module-openidconnect
- Links: relates-to → VCST-4906; sibling → BUG-IMP-046-stale-impersonation-token-replay-VCST-4906; relates-to → BUG_032_057
