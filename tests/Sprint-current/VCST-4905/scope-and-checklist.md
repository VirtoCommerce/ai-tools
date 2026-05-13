# VCST-4905 — Test Scope & AC→Case Mapping

**Ticket:** [VCST-4905](https://virtocommerce.atlassian.net/browse/VCST-4905) — Improve Login On Behalf UX for Support Member from Back Office
**Type:** Story | **Priority:** Medium | **Story Points:** 3 | **Status:** Testing | **Sprint:** 26-09
**Parent:** VCST-4903 (Login on behalf — Epic)
**Affects:** Both (per JIRA field) — but the **deployed code is FRONTEND-only**; back-office Customer-page toolbar entry is noted by AC as "early, need to keep it on Account Page" and is out of this build's scope.
**Module field:** vc-module-customer (no module PR yet for this story)

## Build under test (vcst-qa)

| Component | Version / Artifact | Source |
|---|---|---|
| Platform | `3.1026.0` | `vc-deploy-dev` / `backend/packages.json` |
| Theme | `vc-theme-b2b-vue-2.49.0-pr-2279-3ce0-3ce07383.zip` | `vc-deploy-dev` / `theme/artifact.json` |
| vc-frontend PR | [#2279](https://github.com/VirtoCommerce/vc-frontend/pull/2279) `feat(VCST-4905): improve login on behalf ux` — head sha `3ce07383` | OPEN against `dev` |
| Latest QA deploy | vc-deploy-dev PR #5791 merged 2026-05-12T09:05Z | confirms PR #2279 is live |

## Frontend changes summary (from PR #2279)

- `/account/impersonate/:userId` moved to **top-level + public** route (was nested under `/account`)
- New `useImpersonate` composable in `shared/account` (split from `core`) with `step` / `loading` / `errors` state
- New component `ImpersonateForm.vue` (email + password + Verify and continue + Cancel) — re-auth flow when anonymous OR operator lacks silent-flow credential
- Page `impersonate.vue` rewritten with two paths:
  - **Silent**: when authenticated AND (`operator != null` OR `checkPermissions(CanImpersonate)`) → `impersonateAuthenticated(userId)` + loader + `Switching to customer view…`
  - **Form**: otherwise → render `ImpersonateForm`
- New permission constant `StorefrontPermissions.CanImpersonate = "platform:security:loginOnBehalf"`
- 13 locale files updated (en + 12 others) with `pages.account.impersonate.*` and `shared.account.impersonate_form.*` keys

## Acceptance criteria → IMP case mapping

| AC item | Behaviour | IMP case(s) | Notes |
|---|---|---|---|
| Back Office button on Customer page (Admin SPA) | Visible to operator w/ permission, Customer member type, single account | **N/A this build** | AC: "early, need to keep it on Account Page" |
| Back Office button still on Account page (Admin SPA) | Existing button opens `/account/impersonate/{AccountId}` in new tab | IMP-014, IMP-022 | Already verified today via test-lifecycle |
| URL params on impersonate link (optional) | Current email / target email passed as query | Not in this PR | Optional in AC |
| Store URL not configured → error | Already delivered earlier | — | Out of scope here |
| /account/impersonate route renders Security Verification page | Title, description, email, password, Verify + Cancel | **IMP-001** | Form flow render |
| Support enters own credentials → green message → switch | Verify token exchange + reload to customer mode | **IMP-007** | Form flow happy path |
| Else → error message | Inline error alerts mapped to IdentityErrorType keys | **IMP-003, IMP-026, IMP-027** | Wrong password / impersonate_failed / silent-flow error |
| Cancel | Goes to home | **IMP-002** | |
| Support can interact as customer | Cart, orders, browse | **IMP-020, IMP-021, IMP-029** | |
| Order Creator = Support during impersonation | Backend attribution check | **IMP-030** | Critical, backend |
| Support can log out and close session | Stop Impersonation restores operator without re-auth | **IMP-012** | BL-AUTH-011 |
| Banner persistence | Banner shows operator + target across navigation | **IMP-010, IMP-011** | BL-AUTH-010 |
| Nested impersonation forbidden | Already-impersonated session must NOT silent-skip the form | **IMP-013** | BL-AUTH-009 (P0-security) |
| Self-impersonation | Defined non-circular outcome | **IMP-017** | BL-AUTH-008 |
| RBAC negative — no permission | Form `impersonate` grant rejected; silent flow does not fire | **IMP-036, IMP-037** | Verified today, RE-VERIFY on fresh build smoke only |
| Permission removal stops subsequent impersonations | Role-edit propagation | **IMP-038** | Verified today |

## Business rules to verify (BL-*)

- **BL-AUTH-005** RBAC 6-permission model
- **BL-AUTH-006** Role hierarchy
- **BL-AUTH-007** Storefront logout UX (popup-only)
- **BL-AUTH-008** Self-impersonation non-circular `[P1-data]`
- **BL-AUTH-009** Nested impersonation forbidden `[P0-security]`
- **BL-AUTH-010** Banner persists across SPA navigation `[P1-ux]`
- **BL-AUTH-011** Stop Impersonation restores operator without sign-in `[P1-data]`

## Edge cases (ECL-*)

- **ECL-14.1** Privilege escalation / impersonation chain (token-stack integrity)

## Execution plan

| Layer | Agent | Browser | IMP cases (this run) |
|---|---|---|---|
| Storefront | qa-frontend-expert | playwright-chrome | 001, 002, 003, 007, 008, 009, 010, 011, 012, 013, 017, 030 |
| Backend / Admin SPA + token | qa-backend-expert | playwright-edge | 014, 022, 026, 027 |
| Cross-browser + exploratory | qa-testing-expert | playwright-firefox | SBTM Risk charter — token endpoint resilience, route guard, locale switch, network failure recovery |

**Skipped (already executed/re-verified today, evidence in `reports/test-lifecycle/IMP-032-035*` + `IMP-036-*` + `IMP-038-*`):** IMP-032, 033, 034, 035, 036, 037, 038. These remain in scope of the verdict but no new execution evidence required.
