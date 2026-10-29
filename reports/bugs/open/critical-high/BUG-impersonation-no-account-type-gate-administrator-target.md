# Impersonate grant has no target guard — a non-admin operator gets an Administrator session `[Critical]` `[Security]`

## Status: READY_TO_SUBMIT
**Found by:** agent — regression REG-2026-10-28-1013
**Tracker:** [VCST-6608](https://virtocommerce.atlassian.net/browse/VCST-6608) (Relates → VCST-6417)

**Env:** vcst · Platform 3.1090.0 · Theme 2.61.0-alpha.2605 · Customer 3.1031.0 · Xapi 3.1028.0 · Store 3.1011.0 · Edge (playwright-edge) · reproduced 2026-10-28T20:40Z · TRACE_ID: none (the stand sends neither `Request-Id` nor `traceparent`)
**Evidence package:** `reports/regression/REG-2026-10-28-1013/evidence/IMP-022/` (suite 082 / IMP-022)

## Summary
`POST /connect/token grant_type=impersonate` checks only that the **operator** holds `loginOnBehalf` and that the
**target** exists. An Organization maintainer (Customer-type, not an administrator) impersonated an
Administrator-type user and received a token with `role: "__administrator"`. The Admin SPA also offers
"Login on behalf" on Administrator-type users. Distinct from VCST-5174 (nested impersonation, closed by-design):
this is the first grant, and the operator gains rights it never had.

## Steps to reproduce
1. Sign in to the storefront `{{FRONT_URL}}/sign-in` with a password as `@td(IMPERSONATION_ADMIN)` — Organization maintainer with `platform:security:loginOnBehalf`, `isAdministrator=false`.
2. Open `{{FRONT_URL}}/account/impersonate/<id>` for an Administrator-type user (here the fixture `e2e-test-store-administrator@e2e-contoso.com`: `userType=Administrator`, `isAdministrator=true`, store `{{STORE_ID}}`). The Admin SPA "Login on behalf" button opens the same URL.
3. Observe `POST {{FRONT_URL}}/connect/token` `grant_type=impersonate&user_id=<id>`.

## Expected vs actual
**Expected:** an Administrator-type target is refused (4xx, no token) unless the operator is itself an administrator; the Admin SPA does not offer "Login on behalf" for such users.
**Actual:**
- `/connect/token` → **200**, 30-min token; decoded claims `sub` = target, **`role: "__administrator"`**, `vc_operator_name` = the operator.
- Storefront header: "Impersonation Operator **logged in as** [E2E Test] Store Administrator"; `GetPageContext.user.isAdministrator: true`.

![Operator logged in as an Administrator-type user](../../screenshots/impersonation-no-account-type-gate-administrator-target/IMP-022-admin-target-impersonated.png)
![Admin SPA offers Login on behalf on an Administrator user (regression run)](../../screenshots/impersonation-no-account-type-gate-administrator-target/IMP-022-FAIL-login-on-behalf-present-for-admin-user.png)

## Layer Validation
| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | FAIL (inherits) | `screenshots/IMP-022-admin-target-impersonated.png`, `screenshots/dom-impersonated-home.yml` |
| 2. Backend Admin | FAIL | regression `screenshots/IMP-022-FAIL-login-on-behalf-present-for-admin-user.png` |
| 3. GraphQL xAPI | FAIL (inherits) | `network/pagecontext-user-after-impersonate.json` → `isAdministrator: true` |
| 4. Platform REST API | FAIL | `network/failing-connect-token-impersonate.json` → 200, `role: __administrator` |

**Owning layer:** Layer 4 — platform token endpoint.

## Root Cause Analysis
See `root-cause.md` in the package. `vc-platform` `AuthorizationController.Exchange()` impersonate block: authorizes the
operator's `SecurityLoginOnBehalf`, validates the target only for existence, then `context.User = impersonatedUser.CloneTyped()`
and `CreateTicketAsync(impersonatedUser, …)`. `vc-module-x-api` `ContactSignInValidator` returns early for
`context.User.IsAdministrator`. Present at the pinned platform of bundles v15 (3.1039.15) and v16 (3.1076.9).
Alternatives ruled out: by-design (vc-docs silent; BL-AUTH-006 violation signal "a non-administrator passes a permission
check without holding the claim"); data drift (account types read live). Not verified first-hand: calling an admin-only
REST endpoint with the impersonated token (not done through the UI; the claim is the platform's administrator system role).

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 4 — REST (`/connect/token`)
- **Suggested repo:** VirtoCommerce/vc-platform
- **repoKind:** platform
- **Ownership hint:** platform
- **Component / module:** Security — OpenIddict impersonate grant; Admin SPA Security users blade (companion)
- **RCA anchor:** `src/VirtoCommerce.Platform.Web/Controllers/Api/AuthorizationController.cs` — `IsImpersonateGrantType()` block, after `FindByIdAsync(requestedUserId)`
- **Routing confidence:** HIGH (security change — human review, not auto-fix)
