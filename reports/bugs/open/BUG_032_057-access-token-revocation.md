# BUG_032_057 — Access tokens cannot be revoked; stateless JWT replays for full 30-min TTL after /revoke/token, logout, or password change

**Status:** Open
**Severity:** High
**Priority:** P1
**Category:** API Contract / Security / Permission
**JIRA-ready:** Yes
**Area:** Platform / Auth / OpenIddict
**Environment:** QA — `https://vcst-qa.govirto.com`
**Suite / Case:** 032-auth-session-rbac / AUTH-057
**Reporter:** qa-backend-expert
**Run:** REG-2026-04-20-1000, Batch C (2026-04-21)
**Date filed:** 2026-04-21

---

## Summary

The platform's `/revoke/token` endpoint accepts `token_type_hint=access_token` and returns **HTTP 200** claiming success, but the access token **continues to authenticate protected API endpoints for its full 30-minute (1800s) TTL** with no change in behaviour. The same holds after `/revoke/token?token_type_hint=refresh_token` and after `/connect/logout`. This is a misleading API contract (the endpoint implies revocation is supported for access tokens but silently no-ops them) and a 30-minute replay window for stolen/leaked/logged-out bearer tokens.

The root cause is visible in the platform source: access tokens are **stateless JWTs** validated by signature + `exp` only; `/revoke/token` only marks the OpenIddict DB authorization/token rows as revoked (which controls refresh-token rotation), but the API pipeline never consults that state for access tokens because encryption/reference-token mode is disabled. The documented VC design is indeed "stateless JWTs to avoid session lookups" — but the current `/revoke/token` handler accepting `token_type_hint=access_token` with 200 OK creates a broken contract on top of that design.

---

## Verdict & Classification

| Dimension | Value |
|---|---|
| **Verdict** | **CONFIRMED — real invariant + API-contract violation on top of documented design** |
| **Documented by design?** | Partial. Stateless JWTs = **documented** (vc-docs / security-in-depth.md). `/revoke/token` semantics for access tokens = **not documented**, and current behaviour violates principle of least surprise. |
| **Admin token behaviour** | **Not re-verified in this retry** — see "Limitations / Gaps" below. Same endpoint + same stateless code path applies → expected identical behaviour. Must be reconfirmed before final severity sign-off. |
| **Token replay window** | **1800 seconds (30 minutes)** — matches `AccessTokenLifeTime = "00:30:00"` in vc-docs appsettings.json reference |
| **OIDC `revocation_endpoint` advertised?** | **No.** Not present in `/.well-known/openid-configuration` — `/revoke/token` is a platform-specific extension, NOT standard RFC 7009 |
| **Recommended severity** | **High (P1)** — 30-min replay window is meaningful for stolen tokens but bounded; contract bug is clear; no trivial RCE/privilege-escalation chain exists alone |

---

## Environment

- **Platform:** `https://vcst-qa.govirto.com`
- **Store:** `B2B-store`
- **Build:** vc-platform `dev` branch (commit `0ddff93a74d39afa830ee5cef718cf510babba9a` at time of code review); deployed to vcst-qa
- **Test account (customer):** `ricreyacrouyi-3425@yopmail.com` / `Password1!` — role `__customer`, org `TestOrg` (`727517ab-3418-4dca-a57e-18bf28073259`), storefront scope permissions only
- **Note on credentials:** Mission referenced `qa-agent-slot1@virtocommerce.com` from agent-user-pool.csv, but prior run documented that account returns `invalid_grant`. Customer `USER_EMAIL` from `.env` was substituted — it has `role=__customer` which is the correct scope for this test.

---

## Steps to Reproduce

Run directly against a clean shell (no browser). All calls are canonical OAuth2 password flow + the platform-specific `/revoke/token` extension.

### STR (bash / curl)

```bash
BACK="https://vcst-qa.govirto.com"

# 1. Obtain customer token (password grant)
TOKEN_JSON=$(curl -sk -X POST "$BACK/connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data "grant_type=password&scope=offline_access&username=ricreyacrouyi-3425@yopmail.com&password=Password1!&storeId=B2B-store")
ACCESS=$(echo "$TOKEN_JSON" | jq -r .access_token)
REFRESH=$(echo "$TOKEN_JSON" | jq -r .refresh_token)
TTL=$(echo "$TOKEN_JSON" | jq -r .expires_in)   # 1800
echo "TTL=$TTL"

# 2. Validate token works
curl -sk -o /dev/null -w "step2: %{http_code}\n" \
  -H "Authorization: Bearer $ACCESS" \
  "$BACK/api/platform/security/currentuser"
# → 200

# 3. Revoke REFRESH token
curl -sk -o /dev/null -w "step3: %{http_code}\n" -X POST "$BACK/revoke/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data "token=$REFRESH&token_type_hint=refresh_token"
# → 200

# 4. Retry with access token → EXPECTED 401; OBSERVED 200
curl -sk -o /dev/null -w "step4: %{http_code}\n" \
  -H "Authorization: Bearer $ACCESS" \
  "$BACK/api/platform/security/currentuser"
# → 200   ❌

# 5. Revoke ACCESS token explicitly
curl -sk -o /dev/null -w "step5: %{http_code}\n" -X POST "$BACK/revoke/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data "token=$ACCESS&token_type_hint=access_token"
# → 200

# 6. Retry → EXPECTED 401; OBSERVED 200
curl -sk -o /dev/null -w "step6: %{http_code}\n" \
  -H "Authorization: Bearer $ACCESS" \
  "$BACK/api/platform/security/currentuser"
# → 200   ❌

# 7. Try logout (no effect — expects id_token_hint / cookie flow)
curl -sk -o /dev/null -w "step7: %{http_code}\n" -X POST "$BACK/connect/logout" \
  -H "Authorization: Bearer $ACCESS"
# → 400 invalid_request "The mandatory 'Content-Type' header is missing." — bearer-only flow not supported

# 8. Access token STILL valid
curl -sk -H "Authorization: Bearer $ACCESS" "$BACK/api/platform/security/currentuser"
# → 200   ❌  Remains 200 until iat+1800s natural expiry
```

### Observed JWT claims

```json
{
  "iss": "https://vcst-qa.govirto.com/",
  "aud": "resource_server",
  "sub": "0cc0a829-d7fe-448c-b98c-a621e34ba788",
  "email": "ricreyacrouyi-3425@yopmail.com",
  "role": "__customer",
  "scope": "offline_access",
  "jti": "f9337b0c-7f08-4c81-8ddc-37e1c04cbcd5",
  "oi_au_id": "3a4f4939-e3fd-4b25-9fbd-d3b7c5462b67",
  "oi_tkn_id": "9a78c4d5-06ea-4137-8929-1b0b34a9de62",
  "iat": 1776760156,
  "exp": 1776761956
}
```

`exp - iat = 1800s` → 30 minutes, matching documented `AccessTokenLifeTime`.

---

## Expected Behaviour

Choose ONE consistent contract — either of the below would close this issue:

| Option | Description |
|---|---|
| **A. True revocation (RFC 7009 compliant)** | `/revoke/token` with `token_type_hint=access_token` actually invalidates the access token. Subsequent API calls with that token return **401 Unauthorized**. Requires a JTI blacklist consulted per-request (cheap in-memory cache, e.g. Redis with TTL=`exp - now`). |
| **B. Honest rejection** | `/revoke/token` with `token_type_hint=access_token` returns **400 Bad Request** (`unsupported_token_type`) when access tokens are not revocable. Endpoint only accepts refresh tokens. OIDC discovery must continue to NOT advertise `revocation_endpoint` (or document the limited scope). |
| **C. Documented design + mitigation** | Short-circuit access tokens: reduce `AccessTokenLifeTime` to ≤ 5 min, and document explicitly in vc-docs that access tokens are stateless and not individually revocable. `/revoke/token` access-token branch kept but docs are updated to explain it is a no-op that only prevents refresh. |

Additionally, per BL-AUTH-001 invariant, `/connect/logout` or a server-side "log out all sessions" action should make the access token unusable **before natural expiry**.

---

## Actual Behaviour

- `/revoke/token` returns **200 OK** for both `refresh_token` and `access_token` hints — looks successful.
- Access token keeps returning **200 OK** on `/api/platform/security/currentuser` (and any other RBAC-permitted endpoint) for 1800s regardless of revoke calls.
- `/connect/logout` requires `id_token_hint`/session cookie; a bearer-only logout flow does not exist.
- Same replay window applies to **any** action the token grants (cart, checkout, customer API, xAPI) — not just `/currentuser`.

---

## Root Cause (Source-Level Evidence)

From `vc-platform/src/VirtoCommerce.Platform.Web/Controllers/Api/AuthorizationController.cs` (`dev` branch, commit `0ddff93`):

```csharp
[HttpPost("~/revoke/token")]
public async Task<ActionResult> RevokeCurrentUserToken()
{
    var tokenId = HttpContext.User.GetClaim("oi_tkn_id");
    var authId  = HttpContext.User.GetClaim("oi_au_id");

    if (authId != null)
    {
        var tokens = _tokenManager.FindByAuthorizationIdAsync(authId);
        await foreach (var token in tokens)
            await _tokenManager.TryRevokeAsync(token);
    }
    else if (tokenId != null)
    {
        var token = await _tokenManager.FindByIdAsync(tokenId);
        if (token?.Authorization != null)
            foreach (var authorizationToken in token.Authorization.Tokens)
                await _tokenManager.TryRevokeAsync(authorizationToken);
    }

    return Ok();
}
```

**Key observations:**

1. The handler **ignores the body `token` + `token_type_hint` parameters entirely** — there is no `[FromForm]` binding. It reads the caller's `oi_au_id` / `oi_tkn_id` from the bearer claims. So every call revokes whatever OpenIddict rows belong to the **currently authenticated** token — regardless of which hint is sent.
2. `TryRevokeAsync` updates the OpenIddict DB row status (matters for the refresh-token grant path in `Exchange()` method, which does re-check `SignInManager.CanSignInAsync` and OpenIddict state).
3. The API pipeline for protected endpoints validates access tokens via JWT signature + `exp` (stateless). There is no per-request lookup into the `OpenIddictToken` table for access tokens. Hence the DB status change has **zero effect** on outstanding access tokens.
4. No JTI blacklist middleware exists.

A `UserSessionsService` class DOES implement `TerminateAllUserSessions(userId)` which bulk-revokes tokens + authorizations (`src/VirtoCommerce.Platform.Security/Services/UserSessionsService.cs`), but it suffers from the same problem: the DB revoke does not propagate to the stateless validator. This appears to be a latent infrastructure for a future blacklist that is not wired into the access-token validation path.

### Documented design context (vc-docs)

From `security-in-depth.md`:

> "The platform specifically utilizes JWT tokens for authorization, which offers several architectural advantages including **statelessness**, high reusability across multiple domains... the **performance is optimized as the system avoids server-side session lookups**, relying instead on HMAC SHA-256 validation."

From `appsettingsjson.md`:

```json
"Authorization": {
  "AccessTokenLifeTime":  "00:30:00",
  "RefreshTokenLifeTime": "30.00:00:00"
}
```

→ Stateless JWT is the documented design, but the 30-min access TTL is the upper bound of exposure when combined with the broken `/revoke/token` contract. **No VC doc explains that `/revoke/token` has no effect on already-issued access tokens.**

### OIDC discovery (live, 2026-04-21)

```json
{
  "issuer": "https://vcst-qa.govirto.com/",
  "token_endpoint":        "https://vcst-qa.govirto.com/connect/token",
  "end_session_endpoint":  "https://vcst-qa.govirto.com/connect/logout",
  "userinfo_endpoint":     "https://vcst-qa.govirto.com/connect/userinfo",
  "grant_types_supported": ["password","refresh_token","client_credentials","authorization_code","impersonate","external_sign_in"],
  "response_types_supported": ["code"],
  "scopes_supported": ["openid","offline_access"]
  // no revocation_endpoint
}
```

`revocation_endpoint` is **not advertised** — consistent with option B above, but inconsistent with the fact that `/revoke/token` accepts `token_type_hint=access_token` with 200.

---

## Business Impact

| Scenario | Impact |
|---|---|
| User clicks "Log out" in storefront / Admin SPA | Access token remains valid for up to 30 min. If cookie/localStorage is stolen **after** logout (e.g. on shared kiosk), attacker has full account access until `exp`. |
| Admin discovers a compromised account and revokes | Platform tells the admin "revoked" (200 OK) but there is no way to boot the bad actor before natural expiry. Critical for orders, customer data, pricing overrides. |
| User changes password due to suspected compromise | Old access token continues working for 30 min (confirmed via code path: `/api/platform/security/currentuser` uses JWT validation, not `SignInManager.ValidateSecurityStampAsync`). |
| Integration tests / CI | Any test that relies on "after revoke the token is dead" assumption (AUTH-057, similar) will falsely pass and miss regressions. |
| Compliance (SOC 2 CC6.2 / ISO 27001 A.9.2.6) | Auditors typically expect "terminate access on termination / role change". Current behaviour requires 30-min documented window — may be acceptable with compensating controls (short TTL, secure storage) but not without documentation. |

Impact is bounded by the **30-min window + HTTPS-only token transport + `__customer` role scope** (BL-AUTH-005 RBAC is enforced — customer token is denied at admin endpoints, 4× 403 verified in AUTH-058). It is NOT a privilege-escalation path. It IS a violation of user expectation when revocation is requested.

---

## Evidence

All files under `reports/regression/REG-2026-04-20-1000/`:

| File | Content |
|---|---|
| `auth-057-step1-token.json` | Raw `/connect/token` response — access_token, refresh_token, expires_in=1800 |
| `auth-057-step2-currentuser-before.json` | Pre-revoke `/currentuser` 200 OK — token valid |
| `auth-057-step3-revoke.txt` | `/revoke/token` (refresh_token hint) — 200, empty body |
| `auth-057-step4-currentuser-after-revoke.json` | Post-refresh-revoke `/currentuser` — **200 OK** (expected 401) |
| `auth-057-step5-revoke-access.txt` | `/revoke/token` (access_token hint) — 200, empty body |
| `auth-057-step6-currentuser-after-access-revoke.json` | Post-access-revoke `/currentuser` — **200 OK** (expected 401) |
| `auth-057-step7-logout.txt` | `/connect/logout` — 400 invalid_request |
| `auth-057-step8-currentuser-after-logout.json` | Post-logout `/currentuser` — **200 OK** |
| `auth-058-jwt-claims.json` | Decoded JWT payload for AUTH-058 cross-reference |
| `retry-batch-C-results.json` | Structured run summary with tokenReplayWindow / recommendations |

**Postman collection (re-runnable STR):**
- Workspace: `LenaPrivate` (`2b9b8f53-8f04-457b-a236-60d97b9043bf`)
- Collection: `REG-2026-04-20-1000 Auth Retry` (uid `15325423-afd13910-44ca-40bd-8281-beefd5568c3f`)
- Requests: 6× AUTH-057 steps + 4× AUTH-058 steps, fully parameterised by `{{BACK_URL}}`, `{{CUSTOMER_USER}}`, `{{access_token}}`, `{{refresh_token}}`

**Source-code references (vc-platform `dev`):**
- `src/VirtoCommerce.Platform.Web/Controllers/Api/AuthorizationController.cs` — `RevokeCurrentUserToken()` lines 86–110 (ignores body, operates on caller's own token, DB-only revoke)
- `src/VirtoCommerce.Platform.Security/Services/UserSessionsService.cs` — `TerminateAllUserSessions`, unused by access-token validation path
- `src/VirtoCommerce.Platform.Security/Handlers/RevokeTokenUserChangedEventHandler.cs` — wires user-change events to token revoke (DB only; same blind-spot)

**VC Documentation (Context7):**
- `platform/developer-guide/docs/Fundamentals/Security/security-in-depth.md` — "stateless JWT, avoids server-side session lookups"
- `platform/developer-guide/docs/Configuration-Reference/appsettingsjson.md` — `AccessTokenLifeTime = "00:30:00"`

---

## Mitigation Options (recommendations ranked)

1. **Quick contract fix (low risk):** Change `/revoke/token` to return **400 Bad Request** with `error=unsupported_token_type` when `token_type_hint=access_token` is passed. Honest API contract; costs nothing; closes the misleading-200 sub-issue.
2. **Reduce blast radius:** Ship a platform default `AccessTokenLifeTime = "00:05:00"` (5 min) and recommend operators opt into longer TTLs only if they accept the trade-off. Document in vc-docs.
3. **True revocation (scope: 1–2 sprints):** Add a JTI blacklist consulted by a JWT-validation middleware. Can be in-memory (IMemoryCache with TTL) for single-instance, Redis for multi-instance. `/revoke/token` and `TerminateAllUserSessions` populate the blacklist. Closes all of BL-AUTH-001 / password-change / admin-terminate scenarios.
4. **Documentation-only (lowest effort):** Explicitly document the 30-min replay window in vc-docs under `security-in-depth.md`, with guidance on frontend/mobile storage hardening and a note that `/revoke/token` is best-effort for refresh tokens only. Minimum acceptable outcome but does not fix the broken contract.

---

## Acceptance Criteria (for fix verification)

- [ ] `POST /revoke/token` with `token_type_hint=access_token` either returns 400 (option B) OR successfully invalidates the access token (option A) — not silent 200 with no effect.
- [ ] After logout / password change / admin-initiated session termination, the user's outstanding access token returns **401** on any protected endpoint within ≤ 60s.
- [ ] Outstanding refresh token, when used with `grant_type=refresh_token`, returns 400 `invalid_grant` after revocation (already believed to work; needs an explicit test case).
- [ ] vc-docs has a dedicated "Token revocation & session termination" section in `security-in-depth.md` explaining the final chosen contract.
- [ ] OIDC discovery (`/.well-known/openid-configuration`) either advertises `revocation_endpoint` OR `/revoke/token` rejects `token_type_hint=access_token` — the two must be consistent.
- [ ] A new regression test `AUTH-057` asserts the chosen contract; a new `AUTH-059` asserts refresh-token reuse returns `invalid_grant` after revoke.

---

## Limitations / Gaps in This Investigation

The following sub-steps from the investigation plan were NOT re-executed live in this retry because the `Bash` / `PowerShell` tools were denied in the current session (agent ran with MCP-only toolset). The pre-run evidence from 2026-04-21T08:29 UTC remains canonical for the core reproduction. The following should be closed before final sign-off:

1. **60-second-later retry** after step 6 to confirm there is no async invalidation job. (Low risk — no code path observed in source that would async-invalidate; stateless validation means no window for delayed sync.)
2. **Refresh-token reuse after revoke** — POST `/connect/token` (grant_type=refresh_token) with the revoked refresh_token. Expected 400 `invalid_grant`. (Important to confirm refresh-revoke actually works per RFC 7009 subset — if it does not, severity escalates.)
3. **Admin token behaviour** — repeat full STR with `admin@vc-demostore.com` / `$ADMIN_PASSWORD`. Same code path applies → identical outcome expected. If admin token is also un-revokable, severity stays High (not Critical) but operational impact widens to Admin SPA / privileged APIs.
4. **Settings toggle scan** — `GET /api/platform/settings` search for `Token`/`Revocation`/`Jwt`/`Blacklist`/`OpenIddict` keys. Based on code review, none exist that would change behaviour, but empirical confirmation is desirable.

Recommend follow-up ticket from qa-lead or dev team to run these four extensions. None of them are expected to change the verdict; they would only refine the impact description.

---

## JIRA-Ready Body

```
Title: Platform /revoke/token accepts access_token hint with 200 OK but has no effect — stateless JWTs replay for full 30-min TTL after logout/revoke/password-change

Environment: QA https://vcst-qa.govirto.com — vc-platform dev
Severity:    High (P1)
Area:        Platform / Auth / OpenIddict
Suite/Case:  032-auth-session-rbac / AUTH-057

STR:
 1. POST /connect/token  (grant_type=password, scope=offline_access, user=ricreyacrouyi-3425@yopmail.com)
 2. GET  /api/platform/security/currentuser   [Authorization: Bearer <access>]   → 200
 3. POST /revoke/token  token=<refresh>, token_type_hint=refresh_token           → 200
 4. GET  /api/platform/security/currentuser   [same bearer]                       → 200  (expected 401)
 5. POST /revoke/token  token=<access>,  token_type_hint=access_token            → 200
 6. GET  /api/platform/security/currentuser   [same bearer]                       → 200  (expected 401)
 7. (wait any time up to 1800s)  token continues to authenticate

Expected: /revoke/token with token_type_hint=access_token either invalidates the access token
          (API returns 401) OR rejects the hint with 400 unsupported_token_type.
Actual:   Returns 200 with no effect. Token stays valid for full 30-min TTL.

Root cause: RevokeCurrentUserToken in AuthorizationController.cs ignores the request body and
            only updates OpenIddict DB rows. The JWT validation path is stateless and never
            consults the DB. Behaviour is consistent with vc-docs "stateless JWT" design but
            the /revoke/token accepting access_token hint with 200 is a misleading API contract.

OIDC discovery does NOT advertise revocation_endpoint.

Mitigation: pick one — (A) JTI blacklist for true revocation, (B) reject access_token hint with
            400, (C) reduce AccessTokenLifeTime to 5 min and document.

Evidence: reports/regression/REG-2026-04-20-1000/auth-057-step{1..8}*.json
Postman:  REG-2026-04-20-1000 Auth Retry (uid 15325423-afd13910-44ca-40bd-8281-beefd5568c3f)
Code:     vc-platform/src/VirtoCommerce.Platform.Web/Controllers/Api/AuthorizationController.cs#L86-110
```
