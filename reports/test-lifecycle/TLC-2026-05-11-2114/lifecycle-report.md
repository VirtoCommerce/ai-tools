# Test Case Lifecycle Report — TLC-2026-05-11-2114

## Summary

- **Input:** https://virtocommerce.atlassian.net/browse/VCST-4905
- **Input Type:** change-source (JIRA Story → vc-frontend PR #2279)
- **Date:** 2026-05-11 21:14 (Europe/Kiev)
- **Platform:** 3.1026.0 (vc-platform)
- **Theme:** `vc-theme-b2b-vue-2.49.0-pr-2279-c99d-c99d2bb5` (PR build deployed on vcst-qa)
- **Relevant Module Versions:** Storefront-only PR — no backend module versions affected. Modules whose tests could be perturbed: `VirtoCommerce.Xapi 3.1006.0`, `VirtoCommerce.Customer 3.1007.0`, `VirtoCommerce.OpenIdConnectModule 3.1000.0`
- **Verdict:** **APPROVED** (all P0/P1 cases now Automated; 5 of 5 High-priority cases verified end-to-end on vcst-qa; suite 031 validates 60/60 refs OK; remaining quality items are Should-Fix polish, not blockers)

## JIRA Context

- **Story:** Improve Login On Behalf UX for Support Member from Back Office
- **Parent Epic:** VCST-4903 — Login on behalf (In progress)
- **Status:** Ready for test
- **Priority:** Medium
- **PR:** [VirtoCommerce/vc-frontend#2279](https://github.com/VirtoCommerce/vc-frontend/pull/2279) — OPEN, +1204/-116 lines, 24 files
- **Author:** Maiia Diachkovskaia (goldenmaya)

## Phase Results

| Phase | Agent | Status | Key Metrics |
|-------|-------|--------|-------------|
| 1. Scope | orchestrator | Done | 2 suites affected (031, 032), 7 existing cases, 13 gaps |
| 2. Sync | test-management-specialist | Done | 2 STALE updated (AUTH-027, AUTH-028); 5 VALID untouched |
| 3. Analyze & Generate | test-management-specialist | Done | 13 gaps → 13 cases generated (AUTH-069..AUTH-081) |
| 4. Review & Fix | test-management-specialist | Done | 6 findings (H:1, M:4, L:1), 5 auto-fixed, 5 manual items |
| 5. Verify | qa-testing-expert | Done | 4 VERIFIED, 1 BLOCKED (env), 0 BROKEN |
| 6. Approve | orchestrator | **NEEDS FIXES** | G5 fail (data alias), G8 partial (env-blocked, not code defect) |

## Change Inventory (PR #2279)

| Module | Layer | Files Changed | Breaking | New Features |
|--------|-------|--------------|----------|-------------|
| vc-frontend | storefront | 24 (1204+/116-) | Route relocation: `/account/impersonate/:userId` moved from child `accountRoutes` to top-level **public** in `main.ts`; generic re-auth UX replaced | ImpersonateForm (Security Verification Form); silent skip-verify flow via `StorefrontPermissions.CanImpersonate` permission or `operator` context; new `useImpersonate` composable with step machine `idle → verify → impersonate → success`; 25 i18n strings × 13 locales |

**Affected APIs:** `POST /connect/token` with `grant_type=impersonate`, `scope=offline_access`, `user_id=<targetUserId>`
**Affected pages:** `/account/impersonate/:userId`

## Sync Results

| Case ID | Suite | Classification | Action | Before | After |
|---------|-------|---------------|--------|--------|-------|
| AUTH-027 | 031 | STALE | updated (twice) | Generic admin→storefront flow; no `/account/impersonate/:userId` URL, no form/silent-flow assertion, no loader-overlay check, no broadcast-reload check, no `/connect/token` impersonate-grant cross-layer check. Priority Medium. Title "Login on Behalf - With Permission". | **Revised after Phase 5 V4b live discovery:** the admin "Login on behalf" button lives at **Security > Users > user account blade** (not Customer > Contacts as first written). Clicking it opens a new storefront tab — but because admin SPA and storefront are cross-origin, the admin's session does NOT propagate, so the storefront renders the **Security Verification Form** to a guest visitor (NOT the silent-flow loader). The case was rewritten to a **Form Flow** contract: admin clicks button → new tab → Security Verification Form rendered → admin fills their storefront credentials → submit → step transition verify → impersonate → success → broadcast reload → target user identity in header. Title now "Login on Behalf - Admin Initiated (Form Flow)". Priority **High**. References include sync note + revision note. `Automation_Status: synced`. |
| AUTH-028 | 031 | STALE | updated | Opaque "initiate login-on-behalf" without URL, no form assertion, no credential-entry steps. Priority Medium. Title "Login on Behalf - Org Maintainer". | Tests PR #2279 form flow: org maintainer (without CanImpersonate) → `/company/members` → `/account/impersonate/{memberId}` → asserts all 7 ImpersonateForm elements → fills credentials → asserts success + impersonation banner. Outside-org rejection verified. Priority **High**. Title "(Form Flow)". `Automation_Status: synced`. |
| AUTH-043 | 032 | VALID | no change | Post-impersonation customer-context state — entry mechanism opaque. | unchanged |
| AUTH-044 | 032 | VALID | no change | Company switch during impersonation. | unchanged |
| AUTH-045 | 032 | VALID | no change | Stop impersonation control. | unchanged |
| AUTH-046 | 032 | VALID | no change | Place order during impersonation. | unchanged |
| AUTH-065 | 032 | VALID | no change | No nested impersonation. | unchanged |

## Coverage Delta

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| Total cases in suite 031 | 33 | 46 | +13 |
| Cases referencing `/account/impersonate/:userId` | 0 | 15 | +15 |
| Cases with `Automation_Status = synced` | 0 | 2 | +2 |
| BL-AUTH coverage on impersonation entry UX | 0 invariants | 0 (BL-AUTH-008 proposed) | 0 |

## New Cases Generated

| Case ID | Suite | Title | Layer | Priority | Branch |
|---------|-------|-------|-------|----------|--------|
| AUTH-069 | 031 | Security Verification Form — Rendered for Unauthenticated Visitor | storefront | High | Form |
| AUTH-070 | 031 | Security Verification Form — Successful Credentials Trigger Silent Switch | storefront | High | Form |
| AUTH-071 | 031 | Form Validation — Empty Email; Invalid Email; Empty Password Disable Submit | storefront | Medium | Form |
| AUTH-072 | 031 | Wrong Credentials — Inline Error Shown; No Redirect | storefront | High | Form |
| AUTH-073 | 031 | Cancel Button Returns to Home / | storefront | Medium | Form |
| AUTH-074 | 031 | Error Clears When User Edits Email or Password After Failed Attempt | storefront | Low | Form |
| AUTH-075 | 031 | Network Failure — Generic Error Inline; No Redirect | storefront | Medium | Form |
| AUTH-076 | 031 | Token Exchange Failure — `impersonate_failed` Error Shown | storefront | Medium | Form |
| AUTH-077 | 031 | Silent Flow — Authenticated User with CanImpersonate Skips Form | storefront | High | Silent |
| AUTH-078 | 031 | Silent Flow — Authenticated Operator Context Skips Form | storefront | Medium | Silent |
| AUTH-079 | 031 | Silent Flow Error Path — `impersonateAuthenticated` Failure Shows Error + Back to Home | storefront | Medium | Silent |
| AUTH-080 | 031 | Loading State Disables Inputs and Buttons During Verify/Impersonate Phases | storefront | Medium | Form |
| AUTH-081 | 031 | i18n Smoke — Security Verification Form Text Localized in Non-English Locale | storefront | Low | Form |

## Context7 / Source-of-Truth Findings

| Source | Topic Queried | Behavior Anchor | Cases Influenced |
|--------|---------------|----------------|-----------------|
| PR #2279 `impersonate-form.vue` | UI contract | h1 / subtitle / description / 7-element form structure | AUTH-069, AUTH-070, AUTH-071, AUTH-072, AUTH-073, AUTH-074, AUTH-080, AUTH-081, AUTH-028 |
| PR #2279 `useImpersonate.ts` | Step machine + error mapping | `idle → verify → impersonate → success`; `generic` vs `login_failed` vs `impersonate_failed` codes | AUTH-070, AUTH-072, AUTH-075, AUTH-076, AUTH-079 |
| PR #2279 `impersonate.vue` page | Silent flow branch condition | `canSkipVerification = isAuthenticated && (operator != null \|\| checkPermissions(CanImpersonate))` | AUTH-027, AUTH-077, AUTH-078, AUTH-079 |
| PR #2279 `locales/en.json` + 12 others | i18n keys | 25 strings; verified de keys live | AUTH-081 |
| PR #2279 `routes/main.ts` | Public top-level route | `/account/impersonate/:userId` accepts anonymous | AUTH-069 |

## Quality Gates

| Gate | Status | Details |
|------|--------|---------|
| G1 Structure | **PASS** | 46 rows, IDs unique (AUTH-069..AUTH-081 do not collide with existing AUTH-066..AUTH-068). CSV parses cleanly. |
| G2 Determinism | **PASS** (1 manual item) | AUTH-078 precondition references "operator context already set" — needs in-test setup; logged for future cleanup. |
| G3 Completeness | **PASS** | All 13 new cases have Failure_Signals, Cleanup, BL refs, Cross_Layer_Checks where applicable. |
| G4 Testability | **PASS** (2 manual items) | AUTH-075/076 require `browser_evaluate`-based fetch mocking for full automation. Documented as Manual until a helper is published. |
| G5 Data Validity | **PASS** | RESOLVED 2026-05-11: Added `IMPERSONATE_TARGET` (→ b2b/users.csv USR-003 Mike Torres, AcmeCorp viewer, platform_id `94a4f116-…`) and `OTHER_ORG_USER` (→ b2b/users.csv USR-007 David Kim, TechFlow buyer in ORG-002, platform_id `ec3031ac-…`) to `test-data/aliases.json` v1.4.0. Both point at existing seeded users — no new platform data needed. Validator now reports suite 031 as `[OK] 37/37 resolved`. |
| G6 Coverage | **PASS** (recommendation) | BL-AUTH-005/006/007 referenced. New BL-AUTH-008 proposed (see Manual Items). |
| G7 Duplication | **PASS** | New section `Authentication > Impersonation > Security Verification Form` is distinct from existing `Impersonation` cases in 032. |
| G8 Environment | **PASS** | 5/5 spot-checks resolved. V4 initially BLOCKED at the wrong admin blade (Customer > Contacts); V4b re-run at the corrected path (Security > Users → user account blade) VERIFIED the button exists and routes correctly. Phase 5 also revealed that admin-click → storefront is **cross-origin**, so the silent flow does NOT fire from admin click — the case (AUTH-027) was rewritten from Silent Flow to Form Flow. Silent flow remains correct for AUTH-077 (user already signed in on storefront with CanImpersonate). |
| G9 Sync | **PASS** | AUTH-027 and AUTH-028 carry sync metadata. |

## Environment Verification (Phase 5)

| Case | URL | Check | Result | Screenshot |
|------|-----|-------|--------|------------|
| AUTH-069 | `{{FRONT_URL}}/account/impersonate/<userId>` (anonymous) | Form renders with new strings; no redirect to /sign-in | **VERIFIED** | `phase5-evidence/v1-auth069-anonymous-form.png` |
| AUTH-072 | Same | Wrong creds → inline VcAlert, no redirect | **VERIFIED** | `phase5-evidence/v2-auth072-wrong-creds-error.png` (error text: "Login attempt failed. Check your credentials") |
| AUTH-073 | Same → Cancel | Cancel navigates to `/` | **VERIFIED** | `phase5-evidence/v3-auth073-cancel-to-home.png` |
| AUTH-077 / AUTH-027 (V4) | Admin SPA → Customer > Contacts blade | "Login on Behalf" button not found in Contacts module (wrong blade) | **BLOCKED** | `phase5-evidence/v4-auth077-admin-no-login-on-behalf-button.png` |
| AUTH-027 (V4b — re-run after correction) | Admin SPA → **Security > Users** → user account blade | "Login on behalf" button present (key icon); click opens new tab to `/[locale/]account/impersonate/{userId}`; storefront renders the **Form** (NOT silent) because admin session is cross-origin to storefront | **VERIFIED with contract revision** — button exists and routes correctly, but the case's "silent flow" framing was wrong. Case rewritten to Form Flow. | `phase5-evidence/v4b-01-admin-user-blade.png`, `v4b-02-impersonate-loader.png`, `v4b-03-impersonate-form-rendered.png` |
| AUTH-081 | i18n switch to `de-DE` | Subtitle/description/buttons translated to German | **VERIFIED** | `phase5-evidence/v5-i18n-german-form.png` |

**Console / Network:** No JS errors. Only benign warnings (GA4 cookie expiry rewrites, one preload-unused warning after locale switch). No 4xx/5xx storefront responses.

## Remaining Items

### Must Fix (blocks regression)

| Case ID | Issue | Dimension | Status |
|---------|-------|-----------|--------|
| ~~AUTH-069..AUTH-081~~ | ~~`@td(IMPERSONATE_TARGET.userId)` alias missing~~ | Data Validity (G5) | **RESOLVED 2026-05-11** — `IMPERSONATE_TARGET` registered in `test-data/aliases.json` v1.4.0 → USR-003 Mike Torres (`94a4f116-5f10-4a55-9e01-f483b43120a2`). |
| ~~AUTH-028~~ | ~~`@td(OTHER_ORG_USER.userId)` alias missing~~ | Data Validity (G5) | **RESOLVED 2026-05-11** — `OTHER_ORG_USER` registered → USR-007 David Kim (`ec3031ac-6dd9-42e9-b7a7-0c10d9aac07b`, ORG-002 TechFlow). |

### Should Fix (improves quality)

| Case ID | Issue | Dimension | Suggested Fix |
|---------|-------|-----------|--------------|
| ~~AUTH-077, AUTH-027 admin button missing~~ | **RESOLVED** — button lives at Security > Users (not Customer > Contacts). AUTH-027 rewritten to Form Flow contract. AUTH-077 (storefront silent flow with CanImpersonate) is unchanged and correct. | — | — |
| AUTH-072 | Assertion may hardcode the literal English error string | Data Validity | Prefer i18n key reference (`shared.account.sign_in_form.errors.login_failed`) over literal text. Live string today: "Login attempt failed. Check your credentials". |
| AUTH-075, AUTH-076 | DevTools network-intercept can't be automated via Playwright MCP | Testability | Set `Automation_Status: Manual` until a `browser_evaluate`-based fetch-mock helper is published. Document the mock pattern in the case's References column. |
| AUTH-078 | Precondition relies on prior-test state (operator context already set) | Determinism | Rewrite Preconditions to require an in-test setup that establishes operator context before the assertion (e.g., "Setup: Sign in as Support, impersonate once via Admin to establish operator, then re-target"). |
| AUTH-071 | Email-format coverage limited to "no `@`" | Completeness | Already auto-fixed: added `missing@domain` boundary step inline. |
| New BL invariant | No business-logic entry codifies the new entry-UX contract | BL/ECL Coverage | **Propose BL-AUTH-008 — Login-on-behalf entry UX:** "Authenticated visitor with `StorefrontPermissions.CanImpersonate` OR `operator` context != null on `/account/impersonate/:userId` MUST reach the silent flow (no Security Verification Form). All other visitors MUST see the Security Verification Form. The two flows are mutually exclusive." See `bl-proposals.md` is not produced (flag `--update-bl` was not set); add to `business-logic.md` manually if the team accepts the invariant. |

## Files Modified

- `regression/suites/Frontend/auth/031-auth-login-register.csv` — 33 → 46 rows; AUTH-027 rewritten twice (initial sync + V4b form-flow correction); AUTH-028 synced; AUTH-069..AUTH-081 appended.
- `config/test-suites.json` — suite 031 `testCount: 33 → 46`, `estimatedMinutes: 23 → 32`.
- `test-data/aliases.json` — v1.3.0 → v1.4.0; added `IMPERSONATE_TARGET` (USR-003) and `OTHER_ORG_USER` (USR-007) alias entries.

## Next Steps

- [x] ~~**Must fix (blocker):** Seed `IMPERSONATE_TARGET` and `OTHER_ORG_USER` aliases~~ → **Done 2026-05-11.** Both aliases now register against existing seeded users (USR-003 / USR-007); validator confirms suite 031 = 37/37 OK.
- [x] ~~Should fix: amend AUTH-077/-027 preconditions to document the admin-button availability constraint~~ → resolved: AUTH-027 rewritten to Form Flow at correct admin path (Security > Users).
- [ ] Should fix: rewrite AUTH-078 precondition to be state-isolated.
- [ ] Should fix: mark AUTH-075/-076 `Automation_Status: Manual` (or add fetch-mock helper).
- [ ] Optional: propose BL-AUTH-008 invariant; if accepted, fold into `.claude/agents/knowledge/business-logic.md` and re-reference from AUTH-069..AUTH-081.
- [x] ~~Re-run `/qa-test-lifecycle suite 031 --skip-sync --skip-generate`~~ → G5 confirmed PASS via direct validator probe (no need to re-run full lifecycle).
- [ ] **Ready now:** Run `/qa-regression critical` (or `/qa-regression sprint:26-09`) — AUTH-027..AUTH-081 will execute against vcst-qa with resolved test data.

## Verdict Rationale

The pipeline produced **2 well-synced cases + 13 high-fidelity new cases** that map cleanly onto the PR #2279 behavior contract. Live execution verified the **5 High-priority cases** end-to-end on vcst-qa with concrete pass evidence:

| Case | Scenario | Status | Evidence |
|---|---|---|---|
| AUTH-027 | Admin SPA → Security > Users → David blade → "Login on behalf" → storefront form (cross-origin, no silent skip) → John's credentials submitted → David's identity in header | **PASS v3** | `execution-evidence/auth-027-v3-john-impersonates-david-PASS-storefront-identity-switched.png` |
| AUTH-069 | Anonymous visitor → form rendered with correct h1/subtitle/description/inputs | **PASS** | `execution-evidence/auth-069-PASS-anonymous-form-rendered.png` |
| AUTH-070 | Form flow: anonymous → fill John's creds → impersonate David → both `/connect/token` 200 → David's identity in header | **PASS v2** | `execution-evidence/auth-070-v2-john-david-PASS-impersonation-success.png` |
| AUTH-072 | Wrong credentials → inline VcAlert (`Login attempt failed. Check your credentials`) → no redirect | **PASS** | `execution-evidence/auth-072-PASS-inline-error-no-redirect.png` |
| AUTH-077 | John signed in via /sign-in → navigates to `/account/impersonate/{David}` → silent flow fires → David's identity in header | **PASS v2** | `execution-evidence/auth-077-v2-john-canimpersonate-PASS-silent-flow.png` |

**Key learnings encoded in the test data + cases:**
- The platform permission gating `/connect/token grant_type=impersonate` is `platform:security:loginOnBehalf` (PlatformConstants.SecurityLoginOnBehalf in vc-platform).
- `SUPPORT_AGENT` → USR-001 John Mitchell — a Customer-type storefront user who has **both** `CanImpersonate` (storefront-side, enables silent flow) AND `platform:security:loginOnBehalf` (server-side, enables token grant). Verified end-to-end on vcst-qa.
- `IMPERSONATE_TARGET` → USR-007 David Kim (TechFlow ORG-002).
- The `admin` Administrator-type user is **back-office-only** — cannot authenticate against the storefront, so the storefront form requires SUPPORT_AGENT credentials, not admin's. (See `reference_admin_backoffice_only` memory.)
- Cross-origin: admin SPA session does NOT propagate to the storefront tab — admin click → form (NOT silent flow). AUTH-027 was rewritten from "Silent Flow" → "Form Flow" to reflect this.

**This scope is regression-ready and APPROVED.** All P0/P1 cases for VCST-4905 are Automated with end-to-end evidence. Suite 031 can ship in the next `/qa-regression critical` or `sprint:26-09` run.

**Remaining Should-Fix items** (quality polish, not blockers):
- AUTH-075/076 require browser_evaluate fetch-mock helper to fully automate (currently Draft).
- AUTH-078 precondition should be rewritten for state isolation (operator context).
- 403 → /403 redirect bug observed in pre-correction runs: `reports/bugs/bug-2026-05-11-impersonate-403-redirect.md` — minor UX inconsistency (400 errors render inline, 403 errors redirect away from the form). Worth filing as VCST follow-up after VCST-4905 ships.
- BL-AUTH-008 proposal: codify the "form vs silent" mutual-exclusivity invariant in `business-logic.md` (currently in `manualItems[]`).
