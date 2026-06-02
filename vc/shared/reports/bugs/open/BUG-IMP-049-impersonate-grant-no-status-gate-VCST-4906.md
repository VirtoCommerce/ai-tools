# BUG-IMP-049: Platform `/connect/token grant_type=impersonate` Has No Status Gate — Locked & Invited Users Can Be Impersonated at API Level

**Severity:** High · **Priority:** P1 · **Status:** READY_TO_SUBMIT · **Category:** Security / Authorization / OAuth2
**Owning layer:** Layer 4 — `AuthorizationController.Exchange()` `IsImpersonateGrantType` branch
**Env:** vcst-qa storefront / Platform 3.1026.0 · Theme `vc-theme-b2b-vue-2.49.0-pr-2280-80690ef2` · OpenIdConnectModule 3.1000.0 · `/health` Healthy
**Verified:** 2026-05-14 — playwright-edge
**BL Refs:** BL-AUTH-005 (RBAC at token-issue boundary), BL-AUTH-006 (impersonation scope), BL-AUTH-007 · ECL-14.1
**Related:** Sibling P0 [BUG-IMP-046-stale-impersonation-token-replay-VCST-4906.md](BUG-IMP-046-stale-impersonation-token-replay-VCST-4906.md); parent platform defect [BUG_032_057-access-token-revocation.md](BUG_032_057-access-token-revocation.md)

## Summary

Direct REST `POST /connect/token grant_type=impersonate` returns **HTTP 200** + a valid 30-min Bearer regardless of the target user's account state. The OAuth endpoint does NOT check `LockoutEnd` / `LockoutEnabled` / `EmailConfirmed` on the impersonated user before minting the token. Defense-in-depth — the storefront's `/blocked` redirect for Locked targets — is **frontend-only** and is bypassed entirely by direct REST callers (Postman, curl, malicious server-side script, compromised operator session). The minted token is also honored by the storefront xAPI `/graphql { me }` resolver and returns the Locked/Invited target's full identity — so **Layer 3 also has no per-request user-state revalidation**.

## Operator + Targets

| Role | Alias | Identity | State |
|---|---|---|---|
| Operator | `SUPPORT_AGENT` (USR-001) | John Mitchell · `test-john.mitchell-…@test-agent.com` · `143bc845-…` | Active; perm `platform:security:loginOnBehalf` |
| Target A | `IMPERSONATE_TARGET_BLOCKED` (USR-021) | `AGENT-TEST-imp-target-blocked-20260514@test-agent.com` · `3133b984-…` | **Locked** (`lockoutEnd=9999-12-31`, `/api/platform/security/users/{id}/locked → {locked:true}`) |
| Target B | `IMPERSONATE_TARGET_INVITED` (USR-022) | `AGENT-TEST-imp-target-invited-20260514@test-agent.com` · `fa945873-…` | **Invited** (`emailConfirmed=false`) |

Credentials resolved from `process.env`. No hardcoded passwords.

## Reproduction Steps

### Repro 1 — REST only (security-relevant path)

1. Sign in via storefront as `SUPPORT_AGENT`; capture `T_op` from `localStorage["auth"]`.
2. From any HTTP client (Postman/curl/browser console) POST to `{BACK_URL}/connect/token`:
   ```http
   POST /connect/token HTTP/1.1
   Authorization: Bearer <T_op>
   Content-Type: application/x-www-form-urlencoded

   grant_type=impersonate&scope=offline_access&user_id=3133b984-8e81-40bd-b2b3-847346ee3f4f
   ```
3. **Response: HTTP 200** + `{ access_token, token_type:"Bearer", expires_in:1800, refresh_token }`.
4. Decoded `access_token`: `sub=3133b984-…` (Blocked user), `name=AGENT-TEST-imp-target-blocked-…`, `vc_operator_user_id=143bc845-…` (operator audit preserved), `exp-iat=1800`, `role=__customer`, `organization_id=6fb516c1-…` (TechFlow).
5. Repeat with `user_id=fa945873-…` (Invited target) → **also 200**, equivalent payload. Platform issues token despite `emailConfirmed=false`.
6. Exercise the minted token against xAPI:
   ```http
   POST /graphql
   Authorization: Bearer <impersonation_token_for_locked_target>

   { "query": "{ me { id userName email contact { firstName lastName organizationId } } }" }
   ```
7. **HTTP 200**, `data.me = { id: "3133b984-…", userName: "AGENT-TEST-imp-target-blocked-…", contact: { firstName: "Blocked", lastName: "User", organizationId: "6fb516c1-…" } }`. Locked user's full identity exposed.

### Repro 2 — UI path (asymmetry verification)

1. Sign in as `SUPPORT_AGENT`.
2. Navigate `{FRONT_URL}/account/impersonate/3133b984-…` (Locked) → redirects to `/blocked`; auth wiped (and operator session wiped — see IMP-049-BUG-2).
3. Navigate `{FRONT_URL}/account/impersonate/fa945873-…` (Invited) → **silent success**, lands on `/`, operator chip + revert button visible. Operator can act fully as Invited user (orders, addresses, etc.).

## Expected vs Actual

| Call | Expected | Actual |
|---|---|---|
| `POST /connect/token` impersonate Locked | 400 `invalid_grant` (`user_locked` / `SignInNotAllowed`) | **200** + valid Bearer |
| `POST /connect/token` impersonate Invited | 400 `email_unconfirmed` (or 200 if product confirms by-design) | **200** + valid Bearer |
| `POST /graphql { me }` w/ Locked-target token | 401 / `errors[]` | **200** + Blocked user's full identity |
| UI `/account/impersonate/{locked}` | `/blocked` redirect (frontend mitigation) | Works (UI-only — bypassable) |
| UI `/account/impersonate/{invited}` | Some gate | **No gate** — silent success |

**Smoking gun pairing:** Layer 4 mints without target-state check; Layer 3 doesn't re-check. Layer 1 mitigates Locked via redirect but is bypassable and provides no gate for Invited.

## Root Cause

`vc-platform/src/.../AuthorizationController.cs` @ sha `67ff599`, `Exchange()` `IsImpersonateGrantType` branch (~L257-310): after `FindByIdAsync(userId)`, the code calls `HandleTokenRequest(impersonatedUser, context)` directly. **Missing guards:**

- **No `_signInManager.CanSignInAsync(impersonatedUser)`** — the same guard is present in the refresh-token grant ~50 lines above (`if (!await _signInManager.CanSignInAsync(user)) return BadRequest(SignInNotAllowed());`). `CanSignInAsync` is the ASP.NET Core Identity method that checks `LockoutEnd`, `LockoutEnabled`, and (with `SignInOptions.RequireConfirmedEmail`) `EmailConfirmed`.
- **No `_userManager.IsLockedOutAsync(impersonatedUser)`** or direct `LockoutEnd`/`LockoutEnabled` check.
- **No `_userManager.IsEmailConfirmedAsync(impersonatedUser)`** check.
- `_requestValidators` runs but no shipped `ITokenRequestValidator` gates the impersonate path on target state (GitHub MCP search `LockoutEnd EmailConfirmed impersonate` → 0 results).
- **`SecurityErrorDescriber.SignInNotAllowed()` already exists** (used by refresh-token path); the impersonate path could trivially reuse it.

## Evidence

Under `tests/Sprint-current/VCST-4906/evidence/bug-verification-security/`:

| File | Content |
|---|---|
| `imp-049-bug-1-platform-no-status-gate-2026-05-14.json` | Full repro: both targets' `POST /connect/token` 200 responses, decoded JWTs, `xapi_graphql_me_probe` showing Locked-target token returns full identity, env fingerprint |

Prior sessions: `tests/Sprint-current/VCST-4906/evidence/imp-049/{part-a,part-b,rest-cross-check}.json/.txt/.png` (Firefox cross-check, `/blocked` page, Invited account menu with revert).

## Recommended Fix

Add a `CanSignInAsync` gate in the impersonate branch after `FindByIdAsync` succeeds and before `HandleTokenRequest`:

```csharp
if (impersonatedUser == null) {
    return BadRequest(SecurityErrorDescriber.TokenInvalid());
}

// NEW — gate on target's sign-in eligibility
if (!await _signInManager.CanSignInAsync(impersonatedUser)) {
    return BadRequest(SecurityErrorDescriber.SignInNotAllowed());
}

context.User = impersonatedUser.CloneTyped();
```

`CanSignInAsync` matches the refresh-token grant's existing guard — preferred for consistency. Alternative: granular `IsLockedOutAsync` / `IsEmailConfirmedAsync` for distinct error messages (`user_locked` vs `email_unconfirmed`) — useful for support tooling.

**Defense-in-depth at Layer 3 (xAPI):** Locked users' identity stays accessible for full 30-min TTL after lockout. Consider per-request `CanSignInAsync` at xAPI auth middleware (or shorter TTL) so state changes propagate within bounded window — broader than VCST-4906 scope.

**Product decision needed:** current contract permits impersonating Invited users. Legitimate support workflow? Or vector for operator to silently accept invitations on a buyer's behalf? If "should be blocked", the `CanSignInAsync` gate only catches it if `SignInOptions.RequireConfirmedEmail=true` — otherwise add explicit `IsEmailConfirmedAsync` check.

See [BUG-IMP-049-impersonate-grant-no-status-gate-investigation.md](BUG-IMP-049-impersonate-grant-no-status-gate-investigation.md) for: full `Exchange()` impersonate-branch code, Layer Validation matrix, GitHub MCP code-search confirmation, App Insights query plan, acceptance criteria, related bugs map, JIRA filing.

## Recommended JIRA

`Platform /connect/token grant_type=impersonate has no target-status gate — Locked / Invited users can be impersonated at API`
Labels: `security`, `authentication`, `impersonation`, `oauth2`, `login-on-behalf`, `vcst-4906`, `openiddict`, `Severity:High`, `Priority:P1`
Links: relates-to → VCST-4906; sibling → BUG-IMP-046; relates-to → BUG_032_057
