# BUG_032_057 — Access tokens cannot be revoked; stateless JWT replays for full 30-min TTL after `/revoke/token`, logout, or password change

**Severity:** High · **Priority:** P1 · **Status:** Open · **Category:** API Contract / Security
**Env:** vcst-qa Platform `dev` @ `0ddff93a` · 2026-04-21 · qa-backend-expert · Run REG-2026-04-20-1000 Batch C
**Suite/Case:** `032-auth-session-rbac` / AUTH-057
**BL Violation:** BL-AUTH-001 (logout invalidates session before TTL) · OIDC RFC 7009 partial-compliance

## Summary

`POST /revoke/token` with `token_type_hint=access_token` returns **HTTP 200** but has **no effect** — the access token continues to authenticate protected APIs for its full 30-min (1800s) TTL. Same holds after `token_type_hint=refresh_token` and after `/connect/logout`. The root cause is that the platform validates access tokens as **stateless JWTs** (signature + `exp` only); `/revoke/token` only marks OpenIddict DB rows revoked (which controls refresh-token rotation), and the API pipeline never consults that state for access tokens. The stateless-JWT design is documented; the misleading `200 OK` on access-token revocation is **not** — that's the contract bug. Replay window: **30 minutes** for any stolen/leaked/logged-out bearer.

## Reproduction Steps

Customer account: `ricreyacrouyi-3425@yopmail.com` / `Password1!` (`role=__customer`, B2B-store).

```bash
BACK="https://vcst-qa.govirto.com"

# 1. Get token
TJ=$(curl -sk -X POST "$BACK/connect/token" -H "Content-Type: application/x-www-form-urlencoded" \
  --data "grant_type=password&scope=offline_access&username=ricreyacrouyi-3425@yopmail.com&password=Password1!&storeId=B2B-store")
ACCESS=$(echo "$TJ" | jq -r .access_token); REFRESH=$(echo "$TJ" | jq -r .refresh_token)
# expires_in = 1800

# 2. Token works
curl -sk -H "Authorization: Bearer $ACCESS" "$BACK/api/platform/security/currentuser"   # 200

# 3. Revoke REFRESH
curl -sk -X POST "$BACK/revoke/token" -H "Content-Type: application/x-www-form-urlencoded" \
  --data "token=$REFRESH&token_type_hint=refresh_token"   # 200

# 4. Token STILL works
curl -sk -H "Authorization: Bearer $ACCESS" "$BACK/api/platform/security/currentuser"   # 200  ❌ expected 401

# 5. Revoke ACCESS explicitly
curl -sk -X POST "$BACK/revoke/token" -H "Content-Type: application/x-www-form-urlencoded" \
  --data "token=$ACCESS&token_type_hint=access_token"     # 200

# 6. Token STILL works
curl -sk -H "Authorization: Bearer $ACCESS" "$BACK/api/platform/security/currentuser"   # 200  ❌ expected 401

# 7. Logout (bearer-only) — not supported
curl -sk -X POST "$BACK/connect/logout" -H "Authorization: Bearer $ACCESS"
# 400 invalid_request "The mandatory 'Content-Type' header is missing."

# 8. Token STILL works until iat+1800s natural expiry
curl -sk -H "Authorization: Bearer $ACCESS" "$BACK/api/platform/security/currentuser"   # 200  ❌
```

JWT claims: `iat=1776760156, exp=1776761956 (Δ=1800s)`, `role=__customer`, `oi_au_id=3a4f4939-…`, `oi_tkn_id=9a78c4d5-…`.

## Expected vs Actual

| Endpoint call | Expected | Actual |
|---|---|---|
| Step 4 — `/currentuser` after refresh-revoke | 401 within ≤60s | **200** |
| Step 6 — `/currentuser` after access-revoke | 401 within ≤60s | **200** |
| Step 8 — `/currentuser` after logout | 401 within ≤60s | **200** |
| `/revoke/token` w/ access hint when not supported | 400 `unsupported_token_type` | **200 OK, no effect** |

## Root Cause (code-level)

`vc-platform/src/VirtoCommerce.Platform.Web/Controllers/Api/AuthorizationController.cs#L86-110` — `RevokeCurrentUserToken()`:

```csharp
var tokenId = HttpContext.User.GetClaim("oi_tkn_id");
var authId  = HttpContext.User.GetClaim("oi_au_id");
if (authId != null) {
    var tokens = _tokenManager.FindByAuthorizationIdAsync(authId);
    await foreach (var token in tokens) await _tokenManager.TryRevokeAsync(token);
}
return Ok();
```

**Key:** handler **ignores the body `token` + `token_type_hint`** — no `[FromForm]` binding. It revokes whatever DB rows belong to the **calling** token. `TryRevokeAsync` only touches the OpenIddict DB row; the API pipeline never consults that table for access-token validation (stateless JWT). No JTI blacklist middleware. `UserSessionsService.TerminateAllUserSessions` exists but is wired only to the same DB-revoke path — no effect on outstanding access tokens.

OIDC discovery (`/.well-known/openid-configuration`) does **NOT** advertise `revocation_endpoint` — consistent with "no true revocation", inconsistent with `/revoke/token` accepting `access_token` hint with 200.

## Evidence

| File | Description |
|---|---|
| `reports/regression/REG-2026-04-20-1000/auth-057-step1-token.json` | Raw `/connect/token` response, `expires_in=1800` |
| `…/auth-057-step{2,4,6,8}-currentuser-*.json` | 4× `/currentuser` 200 traces — before revoke, after refresh-revoke, after access-revoke, after logout |
| `…/auth-057-step{3,5}-revoke.txt` | `/revoke/token` 200 responses, empty body |
| `…/auth-057-step7-logout.txt` | `/connect/logout` 400 |
| `…/auth-058-jwt-claims.json` | Decoded JWT for cross-reference |
| Postman: `REG-2026-04-20-1000 Auth Retry` collection (uid `15325423-afd13910-44ca-40bd-8281-beefd5568c3f`) | Re-runnable STR |

See [BUG_032_057-access-token-revocation-investigation.md](BUG_032_057-access-token-revocation-investigation.md) for: vc-docs design-context citations, OIDC discovery payload, business-impact / compliance scenarios, 4 mitigation options ranked, acceptance criteria checklist, limitations of this retry, JIRA-ready ticket body.

## Recommended JIRA

`Platform /revoke/token accepts access_token hint with 200 OK but has no effect — stateless JWTs replay for full 30-min TTL after logout/revoke/password-change`
Labels: `Severity:High`, `Priority:P1`, `Area:Platform`, `Area:Auth`, `Area:OpenIddict`, `Security`, `API-Contract`
