# Impersonating a Locked user returns 200 and signs the operator out — lock gate skipped since VCST-5281 `[High]` `[Security]`

## Status: READY_TO_SUBMIT
**Found by:** agent — regression REG-2026-10-28-1013
**Tracker:** [VCST-6609](https://virtocommerce.atlassian.net/browse/VCST-6609) (Relates → VCST-6417, VCST-6608)

**Env:** vcst · Platform 3.1090.0 · Theme 2.61.0-alpha.2605 · Customer 3.1031.0 · Xapi 3.1028.0 · Store 3.1011.0 · Edge (playwright-edge) · reproduced 2026-10-28T20:37Z (2/2 incl. the regression run) · TRACE_ID: none (the stand sends neither `Request-Id` nor `traceparent`)
**Evidence package:** `reports/regression/REG-2026-10-28-1013/evidence/IMP-049/` (suite 082 / IMP-049 Part A)

## Summary
`POST /connect/token grant_type=impersonate` for a **Locked** user returns 200 with a token. The storefront then shows
`/blocked` and drops the operator's own session. Suite 082 recorded HTTP 400 for this case on 2026-07-15; the only lock
check for this grant (Customer `OrganizationIdRequestValidator`) is now skipped when the locked user resolves no
organization, which VCST-5281 (Customer PR #312) made the normal case for a user locked in its organizations.

## Steps to reproduce
1. Precondition: `@td(IMPERSONATE_TARGET_BLOCKED.userId)` is Locked — `GET {{BACK_URL}}/api/platform/security/users/<id>/locked` → `{locked:true}`; its only organization membership is locked.
2. Sign in to `{{FRONT_URL}}/sign-in` with a password as `@td(IMPERSONATION_ADMIN)` (Organization maintainer of that org, `loginOnBehalf`).
3. Open `{{FRONT_URL}}/account/impersonate/@td(IMPERSONATE_TARGET_BLOCKED.userId)`.
4. Then open `{{FRONT_URL}}/account/dashboard`.

## Expected vs actual
**Expected (suite 082 contract, verified 2026-07-15; Customer 3.1011.2 code):** `/connect/token` → 400 `user_is_locked_out`, no token; storefront shows the "switching failed" error; the operator stays signed in.
**Actual:**
- `/connect/token` → **200**, 30-min token, `sub` = locked user, no `organization_id` claim.
- Storefront lands on `/blocked` ("Your account is blocked"), header shows **Sign in**.
- `/account/dashboard` → `/sign-in?returnUrl=/account/dashboard` — the operator session is gone.

![Locked target: /blocked, operator signed out](../../screenshots/impersonation-locked-target-status-gate-reverted/IMP-049-locked-target-redirected-to-blocked.png)
![Operator must sign in again](../../screenshots/impersonation-locked-target-status-gate-reverted/IMP-049-operator-session-destroyed-signin-redirect.png)

## Layer Validation
| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | FAIL (inherits) | `screenshots/*.png`, `screenshots/dom-blocked-page.yml` |
| 2. Backend Admin | N/A — not probed by the investigation | — |
| 3. GraphQL xAPI | N/A — not probed by the investigation | — |
| 4. Platform REST API | FAIL | `network/failing-connect-token-impersonate.json` → 200 for a locked `sub` |

**Owning layer:** Layer 4 — token endpoint, lock gate in vc-module-customer.

## Root Cause Analysis
See `root-cause.md` in the package. `OrganizationIdRequestValidator.ValidateAsync` returns `[]` when no organization id
resolves, **before** `IsGloballyLocked(context.User)`. Since 52d2d004 (VCST-5281, PR #312, 2026-08-04)
`OrganizationAccessResolver` drops organizations whose membership `IsCurrentlyLocked`, and the storefront sends no
`organization_id`, so a user locked in its organizations resolves none and the lock check is never reached. The platform
grant itself has no lock check. Bundle v15 (Customer 3.1011.2) resolves the org without filtering — gate works; bundle
v16 (3.1029.0) and vcst (3.1031.0) — bypassed. Alternatives ruled out: by-design (the platform refuses locked users on
refresh and in this validator when an org resolves); data drift (lock state read live).

## Regression
Introduced in vc-module-customer 52d2d004 (PR #312, VCST-5281). Last good: 3.1011.2. First bad: 3.1029.0. Fix-forward.

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 4 — REST (`/connect/token`)
- **Suggested repo:** VirtoCommerce/vc-module-customer
- **repoKind:** module
- **Ownership hint:** platform
- **Component / module:** Customer — OpenIddict `OrganizationIdRequestValidator` (defence in depth: vc-platform impersonate grant `IsLockedOutAsync(target)`)
- **RCA anchor:** `src/VirtoCommerce.CustomerModule.Data/OpenIddict/OrganizationIdRequestValidator.cs` — `if (string.IsNullOrEmpty(organizationId)) return [];` precedes `IsGloballyLocked`
- **Routing confidence:** MEDIUM
