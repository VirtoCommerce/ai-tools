# VCST-4906 — Test Scope & AC→Case Mapping

**Ticket:** [VCST-4906](https://virtocommerce.atlassian.net/browse/VCST-4906) — Login On Behalf for Company Employee
**Type:** Story | **Priority:** Medium | **Story Points:** 3 | **Status:** Testing | **Sprint:** 26-09
**Parent:** VCST-4903 (Login on behalf — Epic) | **Sibling:** VCST-4905 (page after impersonation — tested 2026-05-11..14)
**Affects:** Both (per JIRA field) — but deployed code is **FRONTEND-only** (PR #2280)
**Assignee:** Maya Diachkovskaia | **PR author:** goldenmaya

## Build under test (vcst-qa)

| Component | Version / Artifact | Source |
|---|---|---|
| Platform | `3.1026.0` | `vc-deploy-dev` / `backend/packages.json` (vcst-qa) |
| Theme | `vc-theme-b2b-vue-2.49.0-pr-2280-8069-80690ef2.zip` | `vc-deploy-dev` / `theme/artifact.json` (vcst-qa) |
| vc-frontend PR | [#2280](https://github.com/VirtoCommerce/vc-frontend/pull/2280) `feat(VCST-4906): add login on behalf for company members` — head sha `80690ef2` | OPEN against `dev` |
| Risk classification | **High** (Cursor bugbot) — touches impersonation/session-switching, token issuance, redirects, cross-tab broadcast | per PR description |

## Frontend changes (from PR #2280)

- **Members list entry point**: `MembersDropdownMenu` gains "Login on behalf" action gated by `StorefrontPermissions.CanImpersonate` AND target having a security account
- **Confirmation modal**: contains text "You are logging in on behalf of {target}…" + **Continue** / **Cancel** buttons
- **`useImpersonate` refactor**: centralized `requestImpersonateToken`; broadcast scope changed from BOTH tabs to `TabsType.OTHERS` (other tabs reload, current tab redirects)
- **Revert flow**: new `revertImpersonate` / `backToOperator` actions, exposed in **desktop top-header** and **mobile main-menu**
- **`VcLoaderOverlay`**: extended to support slot content (used during impersonate/revert transitions)
- **i18n**: new strings (revert action + loader text) added across 13 locales
- **Unit tests**: expanded for the impersonation composable

## Acceptance criteria → IMP case mapping

| AC | Behaviour | Existing IMP case(s) | Notes |
|---|---|---|---|
| AC#1 — Admin can assign loginOnBehalf permission with **My Organization** scope to Org Maintainer/Employee | Permission catalog presence + assign to role + role to user | **IMP-032, IMP-033, IMP-034** | Already verified during VCST-4905; re-verify role propagation only if smoke fails |
| AC#2 — Member with permission sees "Login On Behalf" menu item on a company member's row | Entry-point visibility gated by `CanImpersonate` AND target has security account | **IMP-039** (positive) <br> **IMP-040** (negative — no security account) | NEW — IMP-039/040 are the primary VCST-4906 coverage |
| AC#3 — Click "Login On Behalf" → Security Verification Informer modal: "You are logging in on behalf of {email}. The session will be audited." + Continue / Cancel | Modal renders w/ target identifier + two CTAs | **IMP-039** (Continue branch + modal content) <br> **IMP-041** (Cancel branch) | NEW |
| AC#4 — Continue → redirect to page from VCST-4905 (`/account/impersonate/{userId}`) | Navigation hand-off to silent-flow path | **IMP-039** (Continue → `/account/impersonate/{userId}` → silent flow) | Cross-story integration with VCST-4905 |
| AC#5a — Impersonated session menu has "Log out" option | Logout reachable from popup-only header menu (per BL-AUTH-007) | **IMP-012** (revert covers end of session) <br> Implicit in IMP-042/043 | Verify logout button still present and works from impersonated session |
| AC#5b — Impersonated session menu has "Revert back to own account" option | Revert UI visible in desktop header and mobile menu | **IMP-042** (desktop) <br> **IMP-043** (mobile) | NEW — header hook + mobile menu hook |
| AC#5c — Previous token invalidated on revert | Stale impersonation token returns 401 after revert | **IMP-046** | NEW — security gate (token revocation) |
| Loader overlay shown during transitions | `VcLoaderOverlay` w/ slot content visible during impersonate/revert | **IMP-044** | NEW |
| Cross-tab broadcast | Other open tabs reload; current tab redirects | **IMP-045** | NEW — `TabsType.OTHERS` behavior |
| i18n on revert text + loader | Non-English locale renders translated text, no raw i18n keys | **IMP-047** | NEW |

## Business rules to verify (BL-*)

- **BL-AUTH-005** RBAC permission model — `platform:security:loginOnBehalf` gate on the menu item (IMP-039/040)
- **BL-AUTH-007** Storefront logout popup-only — Log out from impersonated session uses popup pattern (`main-layout.top-header.account-menu.sign-out-button`)
- **BL-AUTH-009** Nested impersonation forbidden — defensive regression (IMP-013 already verified, do NOT re-execute unless smoke fails)
- **BL-AUTH-010** Banner persists across SPA navigation — verify banner still present after silent-flow handoff from modal
- **BL-AUTH-011** Stop Impersonation restores operator without sign-in — covers the new "Revert back to own account" action (IMP-012, IMP-042, IMP-046)

## Edge cases (ECL-*)

- **ECL-14.1** Privilege escalation / impersonation chain (token-stack integrity) — IMP-046 token-invalidation is the security gate

## Execution plan

| Layer | Agent | Browser | IMP cases (this run) |
|---|---|---|---|
| Storefront entry-point + modal + revert UI | qa-frontend-expert | playwright-chrome | **IMP-039, 040, 041, 042, 044, 045, 047** |
| Mobile viewport (revert in main-menu) | qa-frontend-expert (same session, viewport switch) | playwright-chrome (375×667) | **IMP-043** |
| Token invalidation API gate | qa-backend-expert | playwright-edge | **IMP-046** |
| Cross-browser + exploratory | qa-testing-expert | playwright-firefox | **SBTM Risk charter** — entry-point → modal → silent-flow handoff, Log out from impersonated session, multi-tab broadcast resilience, network failure during impersonation token request |

**Skipped (already verified for VCST-4905, evidence at `tests/Sprint-current/VCST-4905/`):** IMP-001 through IMP-038 (form flow, banner, /account/impersonate route, cross-org, admin setup). These remain in scope of the verdict but no new execution evidence required unless a regression is suspected.

## Test data

- **Operator**: SUPPORT_AGENT (`@td(SUPPORT_AGENT.email)` — John Mitchell on vcst-qa) — must have `StorefrontPermissions.CanImpersonate`
- **Target**: a **company member of the same org** as SUPPORT_AGENT, **with a security account** — required by AC#1's "My Organization scope" and IMP-039's gate
- **Negative target**: a company member **without a security account** (registered contact only, no login) — for IMP-040
- **Stale-token target**: any active member — for IMP-046's pre/post-revert API call

## Output paths

- Scope + checklist: `tests/Sprint-current/VCST-4906/scope-and-checklist.md` (this file)
- Frontend execution report: `tests/Sprint-current/VCST-4906/test-execution-report-frontend.md`
- Backend execution report: `tests/Sprint-current/VCST-4906/test-execution-report-backend.md`
- Exploratory session: `tests/Sprint-current/VCST-4906/exploratory-session.md`
- Evidence: `tests/Sprint-current/VCST-4906/evidence/`, `evidence-mobile/`
- Summary: `tests/Sprint-current/VCST-4906/summary.json`

---

## Delta retest — 2026-05-14 (afternoon) — IMP-048 + IMP-049

Two new cases added to `082-auth-impersonation.csv` (rows 865 / 918) to close coverage gaps Elena identified after the morning run:

| Case | Coverage gap closed | New fixture |
|---|---|---|
| **IMP-048** | Target user with >10 organizations — org switcher scroll + search + context switch (evidence screenshot `evidence/Screenshot 2026-05-14 163709.png`) | `IMPERSONATE_TARGET_MANY_ORGS` → USR-020 (11 Active orgs) |
| **IMP-049 Part A** | Target user with status=Locked — impersonation contract VERIFY | `IMPERSONATE_TARGET_BLOCKED` → USR-021 (lockoutEnd=9999-12-31) |
| **IMP-049 Part B** | Target user invited but `emailConfirmed=false` — impersonation contract VERIFY | `IMPERSONATE_TARGET_INVITED` → USR-022 |

**Fixtures seeded today** on vcst-qa — see `reports/seed/seed-report-impersonation-targets-20260514.md`. Aliases bumped `1.4.4 → 1.4.5`. 11 new `AGENT-TEST-Org-*` orgs added (ORG-009..ORG-019).

**Delta execution plan (this retest only):**

| Layer | Agent | Browser | IMP cases |
|---|---|---|---|
| Storefront org switcher (UI) | qa-frontend-expert | playwright-chrome | **IMP-048** |
| Status-boundary contract lock-in (UI + REST) | qa-testing-expert | playwright-firefox | **IMP-049 Parts A + B** |

**Skipped (covered by morning run):** IMP-039..047. The morning run's P0 (IMP-046 stale-token replay) remains open and gates verdict.

**What to lock in IMP-049 (qa-testing-expert deliverable):**
- Exact HTTP status code from `POST /connect/token grant_type=impersonate` for Locked target → expected 4xx, value TBD
- Exact HTTP status code for Invited target → expected 4xx, value TBD
- Exact UI outcome (red VcAlert vs /403 page vs blank screen) for each
- Whether operator's own session survives each denial
- Update IMP-049 CSV: replace `VERIFY:` markers with locked assertions; bump alias `_comment` blocks if observed contract differs from expectation
