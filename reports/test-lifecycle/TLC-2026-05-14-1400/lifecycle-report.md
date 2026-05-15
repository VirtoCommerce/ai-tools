# Test Case Lifecycle Report — TLC-2026-05-14-1400

## Summary

- **Input:** VCST-4906 — "Login On Behalf for Company Employee"
- **Input Type:** change-source (JIRA Story → vc-frontend PR #2280)
- **Date:** 2026-05-14 14:00 (Europe/Kiev)
- **Platform:** 3.1026.0 (vc-platform)
- **Theme:** `vc-theme-b2b-vue-2.49.0-pr-2280-8069-80690ef2` (PR #2280 build deployed on vcst-qa; PR remains **OPEN/not merged**)
- **Relevant module versions:** `VirtoCommerce.Xapi 3.1007.0`, `VirtoCommerce.Customer 3.1007.0`, `VirtoCommerce.OpenIdConnectModule 3.1000.0`, `VirtoCommerce.ProfileExperienceApiModule 3.1005.0`, `VirtoCommerce.XCart 3.1013.0`
- **Verdict:** **NEEDS FIXES** — Two **P0 security defects** found in PR #2280 (G8 fails). Test cases are well-formed and the verification did its job — the feature itself is broken on the deployed build.

## JIRA Context

- **Story:** VCST-4906 — Login On Behalf for Company Employee
- **Parent Epic:** VCST-4903 — Login on behalf (in progress)
- **Sprint:** 26-09 (2026-05-04 → 2026-05-18)
- **Status:** Ready for test
- **Priority:** Medium (escalates to High/Critical with the security findings below)
- **Assignee (dev):** Maya Diachkovskaia
- **QA:** Elena Mutykova
- **PR:** [VirtoCommerce/vc-frontend#2280](https://github.com/VirtoCommerce/vc-frontend/pull/2280) — OPEN, base=`dev`

## Phase Results

| Phase | Agent | Status | Key Metrics |
|---|---|---|---|
| 1. Scope | orchestrator | Done | 2 suites in scope (082 primary, 031 secondary); change inventory built from PR #2280 file list |
| 2. Sync | test-management-specialist | Done | 5 cases classified — IMP-012/013/015 INCOMPLETE→updated, IMP-016 VALID, AUTH-028 reworked |
| 3. Analyze & Generate | test-management-specialist | Done | 9 new cases (IMP-039..047) covering AC#1-6 gaps |
| 4. Review & Fix | test-management-specialist | Done | 8 review findings (H:1, M:4, L:3); 4 auto-fixed; 5 manual items |
| 5. Verify | qa-testing-expert | Done | 6 VERIFIED, **2 BROKEN (P0 security)**, 4 CHANGED, 3 BLOCKED (out of budget / test data) |
| 6. Approve | orchestrator | **NEEDS FIXES** | G8 FAIL (2 BROKEN); G2 WARN (4 CHANGED selectors); other gates PASS |

## Change Inventory (PR #2280)

| Layer | Path | Net | What changed |
|---|---|---|---|
| storefront | `client-app/pages/company/members.vue` | +44/-6 | "Login on behalf" action on member row dropdown, gated by `StorefrontPermissions.CanImpersonate` + target having security account; opens **confirmation modal** → navigates to Impersonate route |
| storefront | `client-app/shared/account/composables/useImpersonate.ts` | +51/-10 | Centralized `requestImpersonateToken`; broadcast switched to `TabsType.OTHERS`; **NEW `revertImpersonate` / `backToOperator`** |
| storefront | `client-app/shared/account/composables/useImpersonate.test.ts` | +50/-104 | Unit tests updated |
| storefront | `client-app/shared/company/components/members-dropdown-menu.vue` | +33/-19 | New props gate edit/lock/delete vs impersonation actions |
| storefront | `client-app/shared/layout/components/header/_internal/top-header.vue` | +27/-1 | **NEW revert UI hook in header** during impersonation |
| storefront | `client-app/shared/layout/components/header/_internal/mobile-menu/menus/main-menu.vue` | +46/-22 | **NEW revert UI hook in mobile menu** |
| storefront | `client-app/ui-kit/components/molecules/loader-overlay/vc-loader-overlay.vue` | +14/-2 | Slot content support for impersonate/revert progress |
| i18n | `locales/*.json` (13 locales) | +7/-0 each | New strings for revert + loading copy |

**Affected APIs:** `POST /connect/token grant_type=impersonate` (no contract change), revert flow (token-revocation behavior — see BUG-1 below).
**Affected pages:** `/company/members`, header dropdown sitewide, mobile menu.

## Sync Results

| Case ID | Suite | Classification | Action | Before | After |
|---|---|---|---|---|---|
| IMP-012 | 082 | INCOMPLETE | updated | "Stop Impersonation" wording, no revert UI hooks | Now references the new "Revert" header/mobile selectors + token-invalidation assertion. `Automation_Status: synced`. |
| IMP-013 | 082 | INCOMPLETE | updated | Nested-block asserted at dropdown level only | Now asserts BOTH dropdown gate AND URL-flow gate. `Automation_Status: synced`. ⚠️ **URL-flow assertion now FAILS on vcst-qa — see BUG-2.** |
| IMP-015 | 082 | INCOMPLETE | updated | Generic "absence" check | Precondition tightened to "operator without `CanImpersonate`". |
| IMP-016 | 082 | VALID | no change | Own-row no-actions check still accurate. | — |
| AUTH-028 | 031 | REWORKED | updated | Direct route navigation | Now includes confirmation modal interaction + Continue/Cancel assertions; `Automation_Status: Draft` (until label fix from Phase 5). |

## Coverage Delta

| Metric | Before | After | Delta |
|---|---|---|---|
| Suite 082 total cases | 38 | **47** | +9 |
| Suite 082 estimated minutes | 40 | 50 | +10 |
| Suite 031 total cases | 31 | 32 | +1 |
| Cases referencing `/company/members` dropdown | 2 (IMP-015, IMP-016) | **5** (+ IMP-039, IMP-040, AUTH-028 enrichment) | +3 |
| Cases covering "Revert back to operator" UI | 0 | **3** (IMP-042 desktop, IMP-043 mobile, IMP-044 loader) | +3 |
| Cases covering AC#6 token invalidation | 0 | **1** (IMP-046 Critical) | +1 |

## New Cases Generated

| Case ID | Suite | Title | Priority | Phase 5 Result |
|---|---|---|---|---|
| IMP-039 | 082 | Company Members — 'Login on behalf' Action Visible When Operator Has CanImpersonate and Target Has Security Account | High | **VERIFIED** |
| IMP-040 | 082 | Company Members — 'Login on behalf' Hidden When Target Has No Security Account | High | **BLOCKED** (test data — invited member ambiguous) |
| IMP-041 | 082 | Company Members — Confirmation Modal Cancel Dismisses Without Navigation or Session Change | Medium | **VERIFIED** |
| IMP-042 | 082 | Header — 'Revert back to own account' Item Visible During Impersonation (Desktop) | High | **CHANGED** (actual label is dynamic `"Back to {operatorFullName}"`) |
| IMP-043 | 082 | Mobile Menu — 'Revert back to own account' Item Visible During Impersonation | High | **VERIFIED** + stable `[data-testid='mobile-back-to-operator-button']` |
| IMP-044 | 082 | VcLoaderOverlay with Slot Content Displayed During Impersonate and Revert Transitions | Medium | **VERIFIED** |
| IMP-045 | 082 | Cross-Tab Broadcast — Other Open Tabs Reload on Impersonate; Current Tab Redirects | Medium | **BLOCKED** (out of time budget) |
| IMP-046 | 082 | Previous Impersonation Token Invalidated After Revert (AC#6 Security) | **Critical** | **BROKEN — P0 SECURITY DEFECT** (see BUG-1) |
| IMP-047 | 082 | i18n Smoke — Revert Action and Loader Text Localized in Non-English Locale | Low | **BLOCKED** (out of time budget) |

## Source-of-Truth Findings (no Context7 — PR is still OPEN; PR diff IS the source)

| Source | Topic | Behavior Anchor | Cases Influenced |
|---|---|---|---|
| PR #2280 `members.vue` | Dropdown gating + confirmation modal | `CanImpersonate` + target security account → "Login on behalf" item → confirmation modal | IMP-039, IMP-040, IMP-041, AUTH-028 |
| PR #2280 `useImpersonate.ts` | New `revertImpersonate`/`backToOperator` + `TabsType.OTHERS` broadcast | Header/mobile UI hooks; current tab redirects, others reload | IMP-012, IMP-042, IMP-043, IMP-045 |
| PR #2280 `top-header.vue` + `main-menu.vue` | Revert UI surface | Dynamic label `"Back to {operatorFullName}"` (NOT static "Revert back to own account" as JIRA AC suggested) | IMP-042 (label fix), IMP-043 |
| PR #2280 `vc-loader-overlay.vue` | Slot content support | Loader overlay during transitions | IMP-044 |
| VCST-4906 AC#6 | Session security contract | Previous token MUST be invalidated on revert | **IMP-046 — FALSIFIED on vcst-qa (BUG-1)** |

## Quality Gates

| Gate | Status | Details |
|---|---|---|
| G1 Structure | **PASS** | Suite 082 grew 38→47, IDs unique (IMP-039..047 sequential); suite 031 grew 31→32. CSVs parse cleanly. |
| G2 Determinism | **WARN** | Phase 5 surfaced 4 label/selector mismatches (IMP-042, IMP-043, AUTH-028, IMP-041) — selector hypotheses were drafted without live env access; fixes are concrete and listed below. |
| G3 Completeness | **PASS** | All new cases have Failure_Signals, Cleanup, BL refs, Cross_Layer_Checks. |
| G4 Testability | **PASS** | IMP-046 token-invalidation assertion is concrete and falsifiable (probe endpoint = `POST /graphql { me { id } }`; status code 200→401). |
| G5 Data Validity | **PASS** | All new cases reference existing aliases (`@td(SUPPORT_AGENT.*)`, `@td(IMPERSONATE_TARGET.*)`); no hardcoded user IDs/emails. |
| G6 BL/ECL Coverage | **PASS** | BL-AUTH-005/006/007/009/011 + ECL-14.1 referenced across new cases. PROPOSED-BL-AUTH-012 drafted (token invalidation invariant) but **FALSIFIED by Phase 5** — must NOT be promoted to `business-logic.md` until BUG-1 is fixed. |
| G7 Duplication | **PASS** | New sections distinct from existing IMP-* coverage. |
| G8 Environment | **FAIL** | **2 BROKEN findings** — IMP-046 (AC#6 token invalidation defect) and IMP-013 URL-branch (nested impersonation bypass). Both are P0 security defects in PR #2280, not test-case issues. |
| G9 Sync | **PASS** | IMP-012/013/015, AUTH-028 carry sync metadata pointing to VCST-4906 / PR #2280. |

## Environment Verification (Phase 5)

| Case | Check | Result | Evidence |
|---|---|---|---|
| IMP-039 | "Login on behalf" present in member dropdown for SUPPORT_AGENT operator | **VERIFIED** | `phase-5-evidence/imp-039-dropdown-login-on-behalf.png` |
| AUTH-028 | Confirmation modal text matches AC#4 verbatim | **VERIFIED** (text) / **CHANGED** (button label: "OK" not "Continue") | `phase-5-evidence/auth-028-confirmation-modal.png` |
| IMP-041 | Cancel dismisses modal, URL unchanged, no `/connect/token` POST | **VERIFIED** | `phase-5-evidence/imp-041-after-cancel.png` |
| IMP-042 | Header revert item visible while impersonating | **CHANGED** — label is dynamic `"Back to {operatorFullName}"` | `phase-5-evidence/imp-042-header-dropdown-back-to-operator.png` |
| IMP-043 | Mobile menu (375px) revert item visible | **VERIFIED** + selector `[data-testid='mobile-back-to-operator-button']` | `phase-5-evidence/imp-043-mobile-menu-back-to-operator.png` |
| IMP-044 | VcLoaderOverlay visible during impersonate/revert | **VERIFIED** | `phase-5-evidence/imp-044-loader-overlay-during-impersonate.png` |
| **IMP-046** | **AC#6 token invalidated after revert (probe 200 → 401)** | **🔴 BROKEN — probe stays 200 with impersonation identity AFTER revert** | `phase-5-evidence/imp-046-probe-200-pre-revert.txt`, `imp-046-probe-200-POST-revert-BROKEN.txt`, `imp-046-operator-token.txt`, `imp-046-after-revert-operator-restored.png` |
| **IMP-013 (URL branch)** | URL `/account/impersonate/{otherUserId}` from impersonated-no-permission session is blocked | **🔴 BROKEN — URL bypasses CanImpersonate check; chained impersonation succeeds** | `phase-5-evidence/imp-013-nested-impersonation-broken.png` |
| IMP-013 (UI gate) | Actions column empty for impersonated-no-permission user | **VERIFIED** | `phase-5-evidence/imp-013-impersonated-no-actions.png` |
| IMP-040 | "Login on behalf" hidden for member without security account | **BLOCKED** — invited-status member `acme_store_employee_8@acme.com` showed the action; gate condition needs clarification (is "Invited" considered to have a stub security account?) | `phase-5-evidence/imp-040-invited-member-shows-action.png` |
| IMP-045 | Cross-tab broadcast | **BLOCKED** — out of time budget | — |
| IMP-047 | Non-English locale strings | **BLOCKED** — out of time budget | — |

**Console / Network:** No JS errors observed. Token probe endpoint resolved as `POST {{BACK_URL}}/graphql` with `{ "query": "{ me { id userName email } }" }` — confirmed for the deployed Xapi 3.1007.0.

## Bug-Worthy Findings (must be filed as JIRA bugs — sibling to VCST-4906)

### 🔴 BUG-1 — AC#6 violation: impersonation token NOT invalidated server-side after Revert

- **Severity:** P0 Critical (Security)
- **Where:** `useImpersonate.ts::backToOperator()` + backend `/connect/token` impersonation grant flow
- **Repro:** Sign in as operator (SUPPORT_AGENT/USR-001), impersonate target via `/account/impersonate/{userId}` (silent flow), capture `localStorage['auth'].access_token`, make `POST /graphql { me { id } }` → returns target identity (200). Click "Back to {operator}" in header → operator session restored on storefront. Repeat the SAME `POST /graphql { me { id } }` with the SAME captured token → **still returns target identity, status 200** (expected: 401).
- **Impact:** A revoked impersonation session remains usable until natural token expiry (~30 min). Anyone with access to the captured token can continue acting as the impersonated user even after the operator clicks Revert. Direct violation of VCST-4906 AC#6: "Previous Token should be invalidated."
- **Evidence:** `phase-5-evidence/imp-046-probe-200-pre-revert.txt`, `imp-046-probe-200-POST-revert-BROKEN.txt`, `imp-046-operator-token.txt`
- **Suggested fix:** Backend must revoke the impersonation token (refresh + access) when `backToOperator()` is invoked. Frontend revoke call appears to be missing or backend doesn't honor a revocation endpoint.

### 🔴 BUG-2 — Nested impersonation via URL bypasses CanImpersonate check

- **Severity:** P0 Critical (Security)
- **Where:** Likely backend `/connect/token grant_type=impersonate` permission gate (not the storefront UI)
- **Repro:** Sign in as user A with `CanImpersonate`. Impersonate user B (no `CanImpersonate`). From user B's session, navigate directly to `{{FRONT_URL}}/account/impersonate/{userId-of-C}`. The impersonation succeeds silently — user A → B → C. The UI gate on /company/members correctly hides the dropdown action for user B (no Actions column), but the URL flow does not check the current-session permission server-side.
- **Impact:** Contradicts BL-AUTH-009 / ECL-14.1 (no nested impersonation). Allows privilege chaining: A → B → C → ... where each downstream identity has no audit trail back to A.
- **Evidence:** `phase-5-evidence/imp-013-nested-impersonation-broken.png`
- **Suggested fix:** Backend `/connect/token grant_type=impersonate` must verify the CURRENT session's effective permissions (not just whether it has any valid token); reject when caller is itself an impersonated session.

## Remaining Items

### Must Fix (blocks regression)

| Item | Owner | Action |
|---|---|---|
| **File BUG-1 in JIRA** | QA (Elena) | Child of VCST-4906; title "Impersonation token NOT invalidated server-side after Revert — AC#6 violation"; reference PR #2280; attach evidence from `phase-5-evidence/imp-046-*` |
| **File BUG-2 in JIRA** | QA (Elena) | Child of VCST-4906; title "Nested impersonation via URL bypasses CanImpersonate check"; reference PR #2280; attach `phase-5-evidence/imp-013-nested-impersonation-broken.png` |
| **Block PR #2280 merge** | Dev/QA | Comment on PR with both findings; recommend hold until backend fixes ship |
| Update IMP-042 label assertion | test-management-specialist (next sync) | Change from `"Revert back to own account"` to `"Back to {operatorFullName}"` pattern (dynamic) |
| Update IMP-043 selector | test-management-specialist | Replace hypothesized selector with `[data-testid='mobile-back-to-operator-button']` |
| Update AUTH-028 button label | test-management-specialist | Change `Continue` button assertion to `OK` |
| Update IMP-041 sibling-button reference | test-management-specialist | Same as AUTH-028 (`OK`, not `Continue`) |

### Should Fix (improves quality)

| Item | Suggested Fix |
|---|---|
| IMP-040 precondition ambiguity | Clarify whether "Invited" status counts as having a security account; backend confirmation needed. Either tighten precondition ("member with `null` securityAccountId") or seed a contact-only test user (`@td(MEMBER_NO_SECURITY.*)`). |
| IMP-045 (cross-tab broadcast) | Re-run in a follow-up Phase 5 session with explicit multi-tab orchestration; mark `Automation_Status: Manual` if MCP can't reliably observe TabsType.OTHERS broadcast. |
| IMP-047 (i18n) | Re-run after BUG-1/2 fixes ship; verify revert strings in de-DE / ja-JP / zh-CN. |
| Add `data-testid` to desktop revert button | Dev follow-up — current `button:has-text('Back to ')` is fragile against locale switching. Filed as Should-Fix on the PR. |
| PROPOSED-BL-AUTH-012 | **DO NOT promote** to `business-logic.md` — invariant is currently false on vcst-qa. Re-evaluate after BUG-1 fix ships. |

## Files Modified

- `regression/suites/Frontend/auth/082-auth-impersonation.csv` — 38 → 47 cases (IMP-012, IMP-013, IMP-015 synced; IMP-039..047 added)
- `regression/suites/Frontend/auth/031-auth-login-register.csv` — 31 → 32 cases (AUTH-028 reworked with modal step)
- `config/test-suites.json` — suite 082 testCount/estimatedMinutes updated; suite 031 testCount updated
- `reports/full-cycle/last-deploy-state.json` — captured 3.1026.0 / PR #2280 deploy snapshot (was VCST-4707 / 3.1025.0)

## Next Steps

- [ ] **(Today)** File BUG-1 (token invalidation) and BUG-2 (URL bypass) in JIRA as sibling bugs to VCST-4906
- [ ] **(Today)** Comment on PR #2280 with both findings; recommend HOLD until backend fixes
- [ ] **(After dev fix)** Re-run `/qa-test-lifecycle VCST-4906 --skip-sync --skip-generate` to re-verify IMP-046 + IMP-013 URL branch on the fix build
- [ ] Apply CHANGED-finding label/selector fixes (IMP-042, IMP-043, AUTH-028, IMP-041) — small follow-up `test-management-specialist` task
- [ ] Resolve IMP-040 test-data ambiguity (member-without-security-account seeding)
- [ ] Once BUG-1 fix ships: add **BL-AUTH-012** invariant to `business-logic.md` (manual review per `feedback_business_logic_promotion` memory)
- [ ] Once all fixes verified: run `/qa-regression sprint:26-09` to validate full sprint scope

## Verdict Rationale

**NEEDS FIXES** — the lifecycle pipeline did exactly what it should: it caught **two P0 security defects** in PR #2280 (token-invalidation and URL-bypass) by exercising the new test cases against the live deployed feature build. The test cases themselves are well-formed; the failures are real defects in the feature.

PR #2280 must not merge until BUG-1 and BUG-2 are fixed and re-verified. After dev fixes ship and a partial re-run confirms IMP-046 and IMP-013 URL-branch both flip to VERIFIED, the verdict will upgrade to APPROVED (assuming the small label/selector polish for IMP-042/043, AUTH-028/IMP-041 is applied first).
