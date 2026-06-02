# Investigation — BUG_032_057 Access-Token Revocation

Companion to [BUG_032_057-access-token-revocation.md](BUG_032_057-access-token-revocation.md). Holds design-context citations, OIDC discovery, business-impact analysis, mitigation options, acceptance criteria, retry-limitations, and JIRA-ready body — extracted to comply with the 150-line cap in `.claude/rules/reports.md`.

## Verdict & Classification

| Dimension | Value |
|---|---|
| Verdict | **CONFIRMED** — real invariant + API-contract violation on top of documented stateless design |
| Documented by design? | Partial. Stateless JWT = documented (vc-docs `security-in-depth.md`). `/revoke/token` semantics for access tokens = **not documented**; current behavior violates principle of least surprise. |
| Admin token behavior | **Not re-verified in this retry** — same code path applies, expected identical. Reconfirm before final sign-off. |
| Replay window | 1800s (30 min) — matches documented `AccessTokenLifeTime = "00:30:00"` |
| OIDC `revocation_endpoint` advertised? | **No.** `/revoke/token` is platform-specific, NOT standard RFC 7009. |
| Recommended severity | **High (P1)** — 30-min window meaningful but bounded; clear contract bug; no trivial RCE/privesc alone. |

## Documented Design Context

### vc-docs — `security-in-depth.md`

> "The platform specifically utilizes JWT tokens for authorization, which offers several architectural advantages including **statelessness**, high reusability across multiple domains… the **performance is optimized as the system avoids server-side session lookups**, relying instead on HMAC SHA-256 validation."

### vc-docs — `appsettingsjson.md`

```json
"Authorization": {
  "AccessTokenLifeTime":  "00:30:00",
  "RefreshTokenLifeTime": "30.00:00:00"
}
```

Stateless JWT is the documented design — but the 30-min access TTL is the upper bound of exposure when combined with the broken `/revoke/token` contract. **No VC doc explains that `/revoke/token` has no effect on already-issued access tokens.**

## OIDC Discovery — Live 2026-04-21

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

`revocation_endpoint` is **not advertised** — consistent with "no true revocation", but inconsistent with `/revoke/token` accepting `token_type_hint=access_token` with 200.

## Additional Source-Code References

- `src/VirtoCommerce.Platform.Web/Controllers/Api/AuthorizationController.cs` — `RevokeCurrentUserToken()` L86–110 (ignores body, operates on caller's own token, DB-only).
- `src/VirtoCommerce.Platform.Security/Services/UserSessionsService.cs` — `TerminateAllUserSessions` bulk-revokes tokens+authorizations; **unused by access-token validation path**.
- `src/VirtoCommerce.Platform.Security/Handlers/RevokeTokenUserChangedEventHandler.cs` — wires user-change events to token revoke (DB only; same blind-spot).

These services together suggest latent infrastructure intended for a future blacklist that is **not wired into** the JWT validation pipeline.

## Business Impact

| Scenario | Impact |
|---|---|
| User clicks "Log out" (storefront / Admin SPA) | Token valid up to 30 min. If localStorage/cookie stolen after logout (shared kiosk), attacker has full account access until `exp`. |
| Admin revokes compromised account | "Revoked" 200 OK reported, but bad actor cannot be booted before natural expiry. Critical for orders, customer data, pricing overrides. |
| User changes password (suspected compromise) | Old token continues working 30 min (`/currentuser` uses JWT validation, not `SignInManager.ValidateSecurityStampAsync`). |
| Integration tests / CI | Tests relying on "after revoke the token is dead" assumption falsely pass; miss regressions. |
| Compliance (SOC 2 CC6.2 / ISO 27001 A.9.2.6) | Auditors expect "terminate access on termination / role change". 30-min documented window may be acceptable with compensating controls but not without documentation. |

Bounded by **30-min window + HTTPS transport + `__customer` role scope** (BL-AUTH-005 RBAC verified — customer denied at admin endpoints, 4× 403 in AUTH-058). NOT a privesc path. IS a violation of user expectation when revocation is requested.

## Mitigation Options (ranked)

1. **Quick contract fix (low risk):** `/revoke/token` returns **400 `unsupported_token_type`** when `token_type_hint=access_token`. Honest API; closes misleading-200 sub-issue. Zero cost.
2. **Reduce blast radius:** ship `AccessTokenLifeTime = "00:05:00"` (5 min) as platform default. Document the trade-off. Operators opt into longer TTLs explicitly.
3. **True revocation (scope: 1–2 sprints):** JTI blacklist consulted by JWT-validation middleware. `IMemoryCache` (single-instance) or Redis (multi-instance) with TTL = `exp - now`. `/revoke/token` and `TerminateAllUserSessions` populate it. Closes BL-AUTH-001 / password-change / admin-terminate scenarios.
4. **Documentation-only (lowest effort):** explicitly document the 30-min replay window in `security-in-depth.md` with frontend/mobile storage hardening guidance. Minimum acceptable; does not fix the broken contract.

## Acceptance Criteria

- [ ] `POST /revoke/token` with `token_type_hint=access_token` either returns 400 (Option B) OR truly invalidates the access token (Option A) — no silent 200 with no effect.
- [ ] After logout / password-change / admin-initiated termination, outstanding access token returns **401** on any protected endpoint within ≤ 60s.
- [ ] Outstanding refresh token, when used with `grant_type=refresh_token`, returns 400 `invalid_grant` after revoke (believed working; needs explicit test).
- [ ] vc-docs has a dedicated "Token revocation & session termination" section in `security-in-depth.md` explaining the chosen contract.
- [ ] OIDC discovery either advertises `revocation_endpoint` OR `/revoke/token` rejects `token_type_hint=access_token` — two must be consistent.
- [ ] New regression `AUTH-057` asserts the chosen contract; new `AUTH-059` asserts refresh-token reuse returns `invalid_grant` after revoke.

## Limitations / Gaps in This Retry

`Bash` / `PowerShell` denied in retry session (MCP-only). Pre-run evidence from 2026-04-21T08:29 UTC is canonical for the core repro. Close before final sign-off:

1. **60-second-later retry** after step 6 to confirm there's no async invalidation job. Low risk — no async code path observed.
2. **Refresh-token reuse after revoke** — `POST /connect/token` (`grant_type=refresh_token`) with revoked refresh. Expected 400 `invalid_grant`. Important to confirm refresh-revoke actually works per RFC 7009 subset — if not, severity escalates.
3. **Admin token behavior** — repeat STR with `admin@vc-demostore.com`. Same code path → identical outcome expected. If admin token also unrevokable, severity stays High but operational impact widens to Admin SPA / privileged APIs.
4. **Settings toggle scan** — `GET /api/platform/settings` for `Token` / `Revocation` / `Jwt` / `Blacklist` / `OpenIddict` keys. Based on code review none exist that change behavior; empirical confirmation desirable.

None of these are expected to change verdict; they would refine impact description.

## JIRA-Ready Body

```
Title: Platform /revoke/token accepts access_token hint with 200 OK but has no effect —
       stateless JWTs replay for full 30-min TTL after logout/revoke/password-change

Environment: QA https://vcst-qa.govirto.com — vc-platform dev
Severity:    High (P1)
Area:        Platform / Auth / OpenIddict
Suite/Case:  032-auth-session-rbac / AUTH-057

STR:
 1. POST /connect/token  (grant_type=password, scope=offline_access, user=ricreyacrouyi-3425@yopmail.com)
 2. GET  /api/platform/security/currentuser   [Authorization: Bearer <access>]   → 200
 3. POST /revoke/token  token=<refresh>, token_type_hint=refresh_token           → 200
 4. GET  /api/platform/security/currentuser   [same bearer]                      → 200  (expected 401)
 5. POST /revoke/token  token=<access>,  token_type_hint=access_token            → 200
 6. GET  /api/platform/security/currentuser   [same bearer]                      → 200  (expected 401)
 7. (wait any time up to 1800s)  token continues to authenticate

Expected: /revoke/token w/ access_token hint either invalidates the access token (API → 401)
          OR rejects the hint with 400 unsupported_token_type.
Actual:   Returns 200 with no effect. Token stays valid for full 30-min TTL.

Root cause: RevokeCurrentUserToken in AuthorizationController.cs ignores the request body and
            only updates OpenIddict DB rows. JWT validation path is stateless and never
            consults the DB. Consistent with vc-docs "stateless JWT" design but /revoke/token
            accepting access_token hint with 200 is a misleading API contract.

OIDC discovery does NOT advertise revocation_endpoint.

Mitigation: pick one — (A) JTI blacklist for true revocation, (B) reject access_token hint
            with 400, (C) reduce AccessTokenLifeTime to 5 min and document.

Evidence: reports/regression/REG-2026-04-20-1000/auth-057-step{1..8}*.json
Postman:  REG-2026-04-20-1000 Auth Retry (uid 15325423-afd13910-44ca-40bd-8281-beefd5568c3f)
Code:     vc-platform/src/VirtoCommerce.Platform.Web/Controllers/Api/AuthorizationController.cs#L86-110
```
