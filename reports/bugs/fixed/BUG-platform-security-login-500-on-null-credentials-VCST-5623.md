# `POST /api/platform/security/login` returns 500 (not 400) on null credential fields

## Status: READY_TO_SUBMIT

**JIRA:** [VCST-5623](https://virtocommerce.atlassian.net/browse/VCST-5623)
**Env:** vcst-qa @ Platform `3.1053.0-pr-3093-e27a`

## Summary

The anonymous platform login endpoint throws an unhandled `ArgumentNullException`/`NullReferenceException` — mapped to a blanket `500`— whenever `userName` or `password` is `null` (or the request body itself is null/empty), instead of a `400 Bad Request`. The boundary is exactly `null`; empty string and whitespace `userName` values are handled correctly (`200 {"succeeded":false}`). Confirmed in Application Insights to also occur outside this test session, so it's reachable by real traffic, not just a crafted-payload artifact. Pre-existing, unrelated to VCST-5618 (that PR touches only the cookie-redirect handler, not this controller).

## Steps to Reproduce

```
POST {{BACK_URL}}/api/platform/security/login
Content-Type: application/json

{}
```
or `{"userName":null,"password":"x"}`, `{"userName":"admin","password":null}`, `{"userName":"admin"}`, or a literal `null`/empty body.

## Actual Result

| Body | Status | Response |
|---|---|---|
| `{}` / `{"userName":null,...}` | **500** | `{"message":"Value cannot be null. (Parameter 'userName')"}` |
| `{"userName":"admin","password":null}` / `{"userName":"admin"}` | **500** | `{"message":"Value cannot be null. (Parameter 'providedPassword')"}` |
| null/empty raw body | **500** | `{"message":"Object reference not set to an instance of an object."}` |
| `{"userName":"","password":"x"}` (empty string) | 200 ✅ | `{"succeeded":false,...}` |
| `{"userName":"nosuchuser","password":"x"}` | 200 ✅ | `{"succeeded":false,...}` |

No stack trace leaks in the response (`stackTrace: null`, confirmed — `isDevelopment` gate works correctly).

## Expected Result

A malformed/incomplete login payload should return `400 Bad Request`, matching how a missing/wrong password is already handled gracefully.

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | N/A | needs a malformed API client; the Admin SPA always sends both fields |
| 2. Backend Admin | N/A | same |
| 3. GraphQL xAPI | N/A | not in path |
| 4. Platform REST API | **FAIL** | lowest layer — owns the bug |

**Owning layer:** Layer 4 — Platform REST.

## Root Cause Analysis

`vc-platform`, confirmed against `dev` HEAD:

`src/VirtoCommerce.Platform.Web/Controllers/Api/SecurityController.cs` (no `[ApiController]` attribute, so no automatic model-state validation):
```csharp
// L139
var user = await UserManager.FindByNameAsync(request.UserName);   // throws if UserName is null

// L163
var loginResult = await _signInManager.PasswordSignInAsync(user, request.Password, ...); // throws if Password is null
```

`src/VirtoCommerce.Platform.Web/Model/Security/LoginRequest.cs` — plain POCO, zero validation attributes:
```csharp
public class LoginRequest : ValueObject
{
    public string UserName { get; set; }
    public string Password { get; set; }
    public bool RememberMe { get; set; }
}
```

`src/VirtoCommerce.Platform.Web/Middleware/ApiErrorWrappingMiddleware.cs:41` maps every exception to `500` except `DbUpdateConcurrencyException` (→409) — no `ArgumentException`→`400` arm.

**Confirmed reachable outside this test session:** Application Insights (`vcst-qa`, resource group `vcst`) shows a `500` on `Security/Login` at `15:01:04` (before any of this session's probes), plus several more during probing — all 2-10ms responses (vs ~510ms for a real credential check). No `exceptions`/`traces` telemetry exists for it (`ApiErrorWrappingMiddleware` writes the response directly rather than rethrowing — the `traces` table is empty env-wide for this window, a telemetry-config characteristic, not specific to this bug). Net effect: invisible to `/qa-monitoring` except as a `resultCode: 500` row.

**Not a VCST-5618 regression** — PR #3093 touches only `ApiCookieRedirectHandler.cs` (new), `Startup.cs`'s cookie-event wiring, and a test file; not `SecurityController.cs`/`LoginRequest.cs`/the middleware.

**Secondary note:** the null path bypasses the endpoint's `DelayedResponse` timing-attack mitigation (3ms vs ~510ms) — not a user-enumeration oracle since it throws before any user lookup, so timing is identical for existing/nonexistent users either way.

**RCA anchors:** `SecurityController.cs:139` (userName) and `:163` (password). A red-test harness already exists (`tests/VirtoCommerce.Platform.Web.Tests/Controllers/Api/SecurityControllerTests.cs` calls this action directly) — a fix can drop a repro test in with no new scaffolding.

## Severity

**Medium** — `[AllowAnonymous]`, so any unauthenticated caller can trigger a `500` at will. No resource exhaustion (fast response) and no information leak beyond a parameter name, but it's an unauthenticated 500 on the platform's own auth endpoint and pollutes 5xx dashboards/alerting.

## Duplicate Check

Clean.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 4 — REST
- **Suggested repo:** VirtoCommerce/vc-platform
- **repoKind:** platform
- **Ownership hint:** platform
- **Component / module:** Platform Security — `SecurityController.Login`
- **RCA anchor:** `src/VirtoCommerce.Platform.Web/Controllers/Api/SecurityController.cs:139` and `:163`
- **Routing confidence:** HIGH — single repo, exact anchors confirmed via `search_code` + live repro + App Insights corroboration

## Resolution
- **Fixed in:** Platform `3.1061.0` (live on vcst-qa at verification time). Tracker **VCST-5623 → Done** (2026-08-18).
- **Verified:** 2026-08-26, backlog-triage re-verification (REST probe, no browser). `POST /api/platform/security/login` now returns **400** for all three malformed-credential shapes that previously returned 500:

  | Body | Was | Now |
  |---|---|---|
  | `{"userName":null,"password":null}` | 500 | **400** |
  | `{}` | 500 | **400** |
  | `{"userName":"x"}` (no password) | 500 | **400** |

- **Method:** unauthenticated `curl` against `{{BACK_URL}}/api/platform/security/login`; status codes only, no body assertions.
- **Note:** this is a status-code confirmation, not a full `/qa-verify-fix` pass — the RED→GREEN evidence page and tracker transition were not produced. The tracker item was already Done independently.
