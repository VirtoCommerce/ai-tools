# Test Lifecycle Report — Phases 2-4
## TLC-2026-05-14-1400 / VCST-4906 "Login On Behalf for Company Employee"

- **Date:** 2026-05-14
- **Agent:** test-management-specialist
- **Build deployed:** Platform 3.1026.0 | Theme `vc-theme-b2b-vue-2.49.0-pr-2280-8069-80690ef2` (PR #2280, OPEN)
- **Baseline:** TLC-2026-05-11-2114 (VCST-4905, suite 082 had 38 cases IMP-001..038)

---

## Phase 2 — SYNC Results

### Baseline state of affected cases

Before this run, suite 082 had IMP-001..IMP-038 (38 cases). Suite 031 had AUTH-001..AUTH-068 (31 cases, no AUTH-027/028 despite TLC-2026-05-11-2114 report claiming to add them — the cases were generated in the 082-dedicated suite instead).

### Classification table

| Case | Suite | Classification | Action | Summary Before | Summary After |
|------|-------|----------------|--------|----------------|---------------|
| IMP-012 | 082 | INCOMPLETE | Updated in-place | Title "Stop Impersonation — Returns Operator to Own Session State"; steps used generic "Stop impersonation or Exit impersonation" from old account menu; no assertion for PR #2280 'Revert back to own account' header hook; no AC#6 previous-token-invalidation cross-layer check | Title updated to "Revert Impersonation — 'Revert back to own account' Restores Operator Session and Invalidates Target Token"; steps extended to locate 'Revert back to own account' in header (top-header.vue); added VcLoaderOverlay slot content assertion; added capture of impersonation token; added AC#6 token-invalidation cross-layer network assertion (stale token must return 401 post-revert); BL-AUTH-011 retained; Automation_Status: synced |
| IMP-013 | 082 | INCOMPLETE | Updated in-place | Covered URL-based nested impersonation only; did not address PR #2280 /company/members UI entry point gating under an impersonated session | Extended with a /company/members UI check: when operator is in an impersonated session lacking CanImpersonate, the 'Login on behalf' dropdown action must also be absent (PR #2280 members-dropdown-menu.vue gate); two-block structure with --- divider; Automation_Status: synced |
| IMP-015 | 082 | INCOMPLETE | Updated in-place | Preconditions said only "SUPPORT_AGENT is logged in" without clarifying the "no CanImpersonate" branch; title did not distinguish from positive counterpart | Preconditions now explicitly state "assigned role does NOT include StorefrontPermissions.CanImpersonate"; title updated to "No 'Login on behalf' Option When Operator Lacks CanImpersonate"; cross-reference to positive counterpart IMP-039 added; Automation_Status: synced |
| IMP-016 | 082 | VALID | No change | Own row has no actions menu | Unchanged |
| AUTH-028 | 031 | MISSING (not present) | Added as new case | Case supposed to be present per TLC-2026-05-11-2114 report but was absent from actual file | Added AUTH-028 "Login on Behalf — Org Maintainer Clicks 'Login on behalf' at /company/members — Confirmation Modal Then Impersonate Flow" — covers PR #2280 members.vue confirmation modal between click and navigation; Continue triggers silent flow; Cancel discards without navigation; Automation_Status: Draft |

### Diff — IMP-012

**Before (abbreviated):**
```
Title: "Stop Impersonation — Returns Operator to Own Session State"
Steps: Click 'Account menu' → 'Stop impersonation' or 'Exit impersonation'
Assertions: Account menu contains 'Stop impersonation'; banner disappears; operator name restored; URL not /sign-in
Cross_Layer: [NETWORK] POST /connect/token or token-refresh call after stop
References: VCST-4905, VCST-4725, BL-AUTH-006, BL-AUTH-007
Automation_Status: Draft
```

**After:**
```
Title: "Revert Impersonation — 'Revert back to own account' Restores Operator Session and Invalidates Target Token"
Steps: Extended — locate 'Revert back to own account' in top-header (PR #2280); capture {{IMPERSONATION_TOKEN}}; click revert; verify VcLoaderOverlay; verify operator identity restored
Assertions: + 'Revert back to own account' visible in header; + VcLoaderOverlay with slot content during revert; + {{IMPERSONATION_TOKEN}} returns 401 post-revert (AC#6)
Cross_Layer: + [NETWORK] stale {{IMPERSONATION_TOKEN}} → HTTP 401 after revert
References: VCST-4906, VCST-4905, VCST-4725, BL-AUTH-006, BL-AUTH-007, BL-AUTH-011, ECL-14.1
Automation_Status: synced
```

### Diff — IMP-013

**Before (abbreviated):**
```
Steps: Sign in → impersonate target → URL-navigate to /account/impersonate/{SUPPORT_AGENT.userId}
Assertions: Form shown OR error page; no nested impersonation established
```

**After:**
```
Steps: Added /company/members UI entry point check block (--- UI ENTRY POINT CHECK --- divider);
       Check that 'Login on behalf' NOT present in dropdown when impersonated session lacks CanImpersonate;
       Then URL-based nesting check (--- URL-BASED NESTING CHECK --- divider) preserved
Assertions: + Dropdown at /company/members does NOT show 'Login on behalf' for impersonated session
References: VCST-4906, VCST-4905, VCST-4725 + BL-AUTH-009; Automation_Status: synced
```

### Diff — IMP-015

**Before:**
```
Preconditions: "SUPPORT_AGENT (org maintainer) is logged in. /company/members page accessible."
Title: "No 'Login on behalf' Option in Actions Menu"
```

**After:**
```
Preconditions: Clarified — "assigned role does NOT include StorefrontPermissions.CanImpersonate ... Negative branch — absence test for PR #2280 ... positive counterpart IMP-039"
Title: "No 'Login on behalf' Option When Operator Lacks CanImpersonate"
References: Added VCST-4906; cross-ref to IMP-039
Automation_Status: synced
```

---

## Phase 3 — Gap Analysis & Generated Cases

### Gap inventory

| # | Gap Description | Priority | Layer | Mapped To | Source |
|---|-----------------|----------|-------|-----------|--------|
| 1 | /company/members row dropdown — "Login on behalf" VISIBLE when operator has CanImpersonate AND target has security account | High | storefront | IMP-039 (082) + AUTH-028 (031) | PR #2280 members-dropdown-menu.vue gate condition |
| 2 | /company/members — "Login on behalf" HIDDEN when target has no security account (second gate condition) | High | storefront | IMP-040 | PR #2280 members-dropdown-menu.vue second condition |
| 3 | /company/members confirmation modal — Cancel dismisses, no navigation, operator session preserved | Medium | storefront | IMP-041 (082) + AUTH-028 covers Continue | PR #2280 members.vue modal |
| 4 | Header shows "Revert back to own account" during impersonation (desktop) | High | storefront | IMP-042 | PR #2280 top-header.vue +27/-1 |
| 5 | Mobile menu shows revert action during impersonation | High | storefront | IMP-043 | PR #2280 main-menu.vue +46/-22 |
| 6 | VcLoaderOverlay with slot content during impersonate/revert transitions | Medium | storefront | IMP-044 | PR #2280 vc-loader-overlay.vue +14/-2 |
| 7 | Cross-tab broadcast: other tabs reload on impersonate (TabsType.OTHERS change) | Medium | storefront | IMP-045 | PR #2280 useImpersonate.ts broadcast scope change |
| 8 | Previous token invalidated after Revert (AC#6 security-critical) | Critical | storefront+API | IMP-046 | AC#6 explicit, PR #2280 revertImpersonate/backToOperator |
| 9 | i18n smoke — Revert action text and loader text localized in non-English locale | Low | storefront | IMP-047 | PR #2280 +7 strings × 13 locales |

### Generated cases summary

| Case ID | Suite | Title | Layer | Priority | Technique | BL Refs | ECL Refs |
|---------|-------|-------|-------|----------|-----------|---------|---------|
| IMP-039 | 082 | Company Members — 'Login on behalf' Action Visible When Operator Has CanImpersonate and Target Has Security Account | storefront | High | EP (positive branch) | BL-AUTH-005, BL-AUTH-006 | ECL-14.1 |
| IMP-040 | 082 | Company Members — 'Login on behalf' Hidden When Target Has No Security Account | storefront | High | EP (boundary: gate condition 2) | BL-AUTH-005 | ECL-14.1 |
| IMP-041 | 082 | Company Members — Confirmation Modal Cancel Dismisses Without Navigation or Session Change | storefront | Medium | Decision Table (Continue/Cancel) | BL-AUTH-007 | ECL-14.1 |
| IMP-042 | 082 | Header — 'Revert back to own account' Item Visible During Impersonation (Desktop) | storefront | High | EP (positive) | BL-AUTH-006, BL-AUTH-007 | ECL-14.1 |
| IMP-043 | 082 | Mobile Menu — 'Revert back to own account' Item Visible During Impersonation | storefront | High | EP (positive, mobile viewport) | BL-AUTH-006, BL-AUTH-007 | — |
| IMP-044 | 082 | VcLoaderOverlay with Slot Content Displayed During Impersonate and Revert Transitions | storefront | Medium | State Transition (overlay states) | BL-AUTH-006 | — |
| IMP-045 | 082 | Cross-Tab Broadcast — Other Open Tabs Reload on Impersonate; Current Tab Redirects | storefront | Medium | State Transition (broadcast scope) | BL-AUTH-006 | ECL-14.1 |
| IMP-046 | 082 | Previous Impersonation Token Invalidated After Revert (AC#6 Security) | storefront+API | Critical | Error Guessing (security — token lifecycle) | BL-AUTH-007, BL-AUTH-011 | ECL-14.1 |
| IMP-047 | 082 | i18n Smoke — Revert Action and Loader Text Localized in Non-English Locale | storefront | Low | EP (locale equivalence class) | — | — |
| AUTH-028 | 031 | Login on Behalf — Org Maintainer Clicks 'Login on behalf' at /company/members — Confirmation Modal Then Impersonate Flow | storefront | High | State Transition (modal + silent flow) | BL-AUTH-005, BL-AUTH-006 | ECL-14.1 |

**Total new cases generated: 10** (9 in suite 082, 1 in suite 031)

### Suite 082 count progression

| State | Count |
|-------|-------|
| Before this run | 38 |
| After Phase 2 (synced, no new) | 38 |
| After Phase 3 (new IMP-039..047) | 47 |
| config/test-suites.json testCount | Updated 38 → 47; estimatedMinutes 40 → 50 |

---

## Phase 4 — 7-Dimension Quality Review

### Cases reviewed: IMP-012, IMP-013, IMP-015 (synced), IMP-039..IMP-047, AUTH-028

### Review findings

| Case | Dimension | Severity | Issue | Disposition |
|------|-----------|----------|-------|-------------|
| IMP-012 | D2 Determinism | Medium | `browser_evaluate` to capture access_token from localStorage assumes the storefront stores the token at a known key — the actual key (e.g., `vc_token`, `access_token`) is not verified. If the key is wrong the capture step silently returns null and the AC#6 assertion becomes vacuous. | MANUAL — Phase 5 must verify the localStorage key on live env; update step with exact key before Automated status. |
| IMP-046 | D4 Testability | High | The "make API call with stale token" step references `GET {{BACK_URL}}/api/account` as the probe endpoint. This endpoint's exact auth behavior needs verification — some VC API endpoints may return 200 for anonymous/expired tokens or have different revocation behavior. The test could false-pass if the probe endpoint does not use Bearer token auth. | MANUAL — Phase 5 must verify that `GET {{BACK_URL}}/api/account` with an expired Bearer token returns 401 (not 200/403). If a different endpoint better proves revocation, update the step. |
| IMP-046 | D2 Determinism | Medium | `{{IMPERSONATION_ACCESS_TOKEN}}` is captured via browser_evaluate — the exact storage mechanism (localStorage key, cookie name) depends on the storefront runtime. If the capture fails (null/undefined), the pre-revert 200 assertion will fail with a misleading error rather than catching the real issue. | AUTO-FIXED — Added explicit `[ASSERT] {{IMPERSONATION_ACCESS_TOKEN}} is a non-empty JWT string` after capture step to surface silent null. |
| IMP-045 | D4 Testability | Medium | Cross-tab broadcast test requires opening Tab 2 and observing an automatic reload. Playwright MCP `browser_tabs` tool is available for multi-tab scenarios, but the test's Pass/Fail criterion relies on detecting a DOM change (automatic reload) in Tab 2 without explicit user action. This is difficult to assert deterministically via snapshot. | MANUAL — Phase 5 agent (qa-frontend-expert) should verify with `browser_tabs` + `browser_wait_for` to detect URL change or reload in Tab 2. |
| IMP-043 | D2 Determinism | Medium | Mobile menu selector is described as "hamburger icon or equivalent" — not a stable selector. PR #2280 main-menu.vue should have a `data-testid` or ARIA role on the mobile menu toggle. | MANUAL — Phase 5 must snapshot the mobile menu toggle at 375px viewport and record the actual selector. |
| IMP-040 | D5 Data Validity | Medium | The test requires an org member who has NO security account (contact-only or invited-pending). There is no `@td()` alias for such a user in `test-data/aliases.json`. The Preconditions say "identified by Admin SPA if needed" which is manual. | MANUAL — If a stable contact-without-account exists in vcst-qa, add an alias; otherwise this case stays Manual until test data is seeded. |
| IMP-039 | D7 Duplication | Low | AUTH-028 in suite 031 covers the full journey (confirmation modal + Continue + impersonation). IMP-039 is the atomic presence-of-dropdown-item check. Acceptable per framework (IMP-039 = atomic visibility; AUTH-028 = journey). | Acceptable — noted. |
| IMP-041 | D3 Completeness | Low | The "Continue" happy path of the confirmation modal is covered by AUTH-028 but not by a dedicated 082 case. IMP-041 only covers Cancel. This is acceptable per minimum-effective-set: the journey (Continue → impersonation) is better expressed as a journey case (AUTH-028). | Acceptable — no new case needed. |
| IMP-047 | D5 Data Validity | Low | Hardcodes "German (de)" locale assumption — if vcst-qa store does not have German enabled, the language selector won't appear. | AUTO-FIXED — Added fallback: "or navigate to {{FRONT_URL}}/de/ or Japanese equivalent" with conditional note. |
| IMP-044 | D2 Determinism | Low | The revert transition overlay may be too brief to capture in a snapshot (race condition). The assertion softened to "VcLoaderOverlay visible with non-empty slot content text" — if the overlay appears <100ms, the test may not catch it. | MANUAL — Phase 5 verify: capture screenshot immediately after triggering revert; if overlay is too brief, document as "timing-sensitive — instrument with DevTools Performance trace if needed." |

### Auto-fixed items (applied directly to CSV)

| Case | Fix Applied |
|------|-------------|
| IMP-046 | Added explicit `[ASSERT] {{IMPERSONATION_ACCESS_TOKEN}} is a non-empty JWT string` assertion after capture step to prevent vacuous pass on null token |
| IMP-047 | Softened locale assumption — added "or locale-prefixed equivalent" in Steps to handle stores without language switcher UI |
| IMP-013 | Added `--- UI ENTRY POINT CHECK ---` and `--- URL-BASED NESTING CHECK ---` dividers for readability and deterministic ordering |
| IMP-039 | Added `[DOM] Other standard actions also present` assertion for completeness |

### Manual items remaining (for Phase 5)

| Case | Dimension | Issue | Resolution Path |
|------|-----------|-------|-----------------|
| IMP-012 | D2 | localStorage key for access_token capture — verify exact key on live env | Phase 5: browser_evaluate to enumerate localStorage keys during impersonation |
| IMP-046 | D4 | Verify `GET {{BACK_URL}}/api/account` returns 401 for expired Bearer token | Phase 5: qa-backend-expert test the probe endpoint with an expired token before finalizing |
| IMP-045 | D4 | Multi-tab reload detection via browser_tabs requires live verification | Phase 5: qa-frontend-expert with browser_tabs + browser_wait_for |
| IMP-043 | D2 | Mobile menu toggle selector — capture from live 375px snapshot | Phase 5: snapshot at 375px + record exact data-testid or ARIA label |
| IMP-040 | D5 | No test data alias for contact-without-security-account member | Phase 5 / seed-data: if vcst-qa has an invited-pending member, add alias `IMP_TARGET_NO_ACCOUNT`; otherwise mark Manual |

### New BL invariant draft (manual items — do NOT auto-promote)

**PROPOSED-BL-AUTH-012:** "Upon revert-impersonation (`backToOperator()` in `useImpersonate.ts`), the impersonation access_token MUST be revoked server-side within the same request cycle. Any subsequent API call using the revoked token MUST return HTTP 401. The operator's own token (restored by the revert) MUST NOT be affected." — See IMP-046 References column; requires user approval before promotion to `business-logic.md`.

---

## Coverage Summary

### RTM snapshot — VCST-4906 ACs

| AC | Acceptance Criterion | Covered By | Status |
|----|---------------------|------------|--------|
| AC-1 | Admin assigns loginOnBehalf with My Organization scope to Org Maintainer/Employee | IMP-032..034 (pre-existing, VCST-4905) | Covered |
| AC-2 | Company member with permission sees "Login On Behalf" menu item | IMP-039, AUTH-028 | NEW — covered |
| AC-3 | Company member clicks Login On Behalf | IMP-039, AUTH-028 | NEW — covered |
| AC-4 | Security Verification Informer modal with "You are logging in on behalf of..." + Continue/Cancel | AUTH-028, IMP-041 | NEW — covered |
| AC-5 | If Continue → redirect to VCST-4905 page (silent flow) | AUTH-028 | NEW — covered |
| AC-6 | Revert option; Previous Token MUST be invalidated | IMP-012 (synced), IMP-042, IMP-043, IMP-046 | NEW — covered |

---

## Files Modified

- `regression/suites/Frontend/auth/082-auth-impersonation.csv` — 38 → 47 cases; IMP-012/013/015 synced; IMP-039..047 appended
- `regression/suites/Frontend/auth/031-auth-login-register.csv` — +1 case (AUTH-028 added)
- `config/test-suites.json` — suite 082 testCount: 38 → 47; estimatedMinutes: 40 → 50

---

## Final Structured JSON

```json
{
  "runId": "TLC-2026-05-14-1400",
  "ticket": "VCST-4906",
  "date": "2026-05-14",
  "syncResults": [
    {
      "caseId": "IMP-012",
      "suite": "082",
      "classification": "INCOMPLETE",
      "action": "updated",
      "summaryBefore": "Stop impersonation via Account menu dropdown 'Stop impersonation' / 'Exit impersonation'; no PR #2280 'Revert back to own account' header hook; no AC#6 token-invalidation cross-layer check",
      "summaryAfter": "Updated title + steps to 'Revert back to own account' in top-header (PR #2280 top-header.vue); VcLoaderOverlay slot assertion; token capture + AC#6 stale-token-returns-401 cross-layer check; Automation_Status: synced"
    },
    {
      "caseId": "IMP-013",
      "suite": "082",
      "classification": "INCOMPLETE",
      "action": "updated",
      "summaryBefore": "URL-based nested impersonation only; did not cover /company/members UI entry point gating under an impersonated session (PR #2280 members-dropdown-menu.vue)",
      "summaryAfter": "Extended with /company/members UI entry point block (--- divider); 'Login on behalf' must be absent in dropdown for impersonated session lacking CanImpersonate; URL-based nesting block preserved; Automation_Status: synced"
    },
    {
      "caseId": "IMP-015",
      "suite": "082",
      "classification": "INCOMPLETE",
      "action": "updated",
      "summaryBefore": "Preconditions did not explicitly state 'no CanImpersonate' branch; no cross-reference to positive counterpart",
      "summaryAfter": "Preconditions explicitly state 'assigned role does NOT include StorefrontPermissions.CanImpersonate'; title clarified; cross-ref to IMP-039 added; Automation_Status: synced"
    },
    {
      "caseId": "IMP-016",
      "suite": "082",
      "classification": "VALID",
      "action": "no-change",
      "summaryBefore": "Own row has no actions menu",
      "summaryAfter": "Unchanged"
    },
    {
      "caseId": "AUTH-028",
      "suite": "031",
      "classification": "MISSING",
      "action": "added",
      "summaryBefore": "Case not present in file (reported as added by TLC-2026-05-11-2114 but absent from actual CSV)",
      "summaryAfter": "Added: 'Login on Behalf — Org Maintainer Clicks Login on behalf at /company/members — Confirmation Modal Then Impersonate Flow'; covers PR #2280 members.vue confirmation modal; Continue/Cancel; silent flow; Automation_Status: Draft"
    }
  ],
  "gapInventory": [
    {"gap": "/company/members 'Login on behalf' visible (CanImpersonate + target has security account)", "priority": "High", "layer": "storefront", "mappedTo": "IMP-039"},
    {"gap": "/company/members 'Login on behalf' hidden (target has no security account)", "priority": "High", "layer": "storefront", "mappedTo": "IMP-040"},
    {"gap": "Confirmation modal Cancel dismisses without navigation", "priority": "Medium", "layer": "storefront", "mappedTo": "IMP-041"},
    {"gap": "Header 'Revert back to own account' visible during impersonation (desktop)", "priority": "High", "layer": "storefront", "mappedTo": "IMP-042"},
    {"gap": "Mobile menu 'Revert back to own account' visible during impersonation", "priority": "High", "layer": "storefront", "mappedTo": "IMP-043"},
    {"gap": "VcLoaderOverlay slot content during impersonate/revert transitions", "priority": "Medium", "layer": "storefront", "mappedTo": "IMP-044"},
    {"gap": "Cross-tab broadcast: TabsType.OTHERS — other tabs reload", "priority": "Medium", "layer": "storefront", "mappedTo": "IMP-045"},
    {"gap": "Previous token invalidated after Revert (AC#6)", "priority": "Critical", "layer": "storefront+API", "mappedTo": "IMP-046"},
    {"gap": "i18n: Revert action and loader text localized (de/ja)", "priority": "Low", "layer": "storefront", "mappedTo": "IMP-047"},
    {"gap": "Org Maintainer confirmation modal + Continue flow (journey)", "priority": "High", "layer": "storefront", "mappedTo": "AUTH-028"}
  ],
  "generatedCases": [
    {"caseId": "IMP-039", "suite": "082", "title": "Company Members — 'Login on behalf' Action Visible When Operator Has CanImpersonate and Target Has Security Account", "layer": "storefront", "priority": "High"},
    {"caseId": "IMP-040", "suite": "082", "title": "Company Members — 'Login on behalf' Hidden When Target Has No Security Account", "layer": "storefront", "priority": "High"},
    {"caseId": "IMP-041", "suite": "082", "title": "Company Members — Confirmation Modal Cancel Dismisses Without Navigation or Session Change", "layer": "storefront", "priority": "Medium"},
    {"caseId": "IMP-042", "suite": "082", "title": "Header — 'Revert back to own account' Item Visible During Impersonation (Desktop)", "layer": "storefront", "priority": "High"},
    {"caseId": "IMP-043", "suite": "082", "title": "Mobile Menu — 'Revert back to own account' Item Visible During Impersonation", "layer": "storefront", "priority": "High"},
    {"caseId": "IMP-044", "suite": "082", "title": "VcLoaderOverlay with Slot Content Displayed During Impersonate and Revert Transitions", "layer": "storefront", "priority": "Medium"},
    {"caseId": "IMP-045", "suite": "082", "title": "Cross-Tab Broadcast — Other Open Tabs Reload on Impersonate; Current Tab Redirects", "layer": "storefront", "priority": "Medium"},
    {"caseId": "IMP-046", "suite": "082", "title": "Previous Impersonation Token Invalidated After Revert (AC#6 Security)", "layer": "storefront+API", "priority": "Critical"},
    {"caseId": "IMP-047", "suite": "082", "title": "i18n Smoke — Revert Action and Loader Text Localized in Non-English Locale", "layer": "storefront", "priority": "Low"},
    {"caseId": "AUTH-028", "suite": "031", "title": "Login on Behalf — Org Maintainer Clicks 'Login on behalf' at /company/members — Confirmation Modal Then Impersonate Flow", "layer": "storefront", "priority": "High"}
  ],
  "reviewFindings": [
    {"caseId": "IMP-012", "dimension": "D2-Determinism", "severity": "Medium", "issue": "localStorage key for access_token capture not verified — assumes known key; null capture makes AC#6 assertion vacuous", "suggestedFix": "Phase 5: enumerate localStorage keys during impersonation via browser_evaluate; update step with exact key"},
    {"caseId": "IMP-046", "dimension": "D4-Testability", "severity": "High", "issue": "Probe endpoint GET /api/account auth behavior unverified — may not return 401 for expired Bearer tokens", "suggestedFix": "Phase 5: qa-backend-expert verify endpoint rejects expired Bearer token with 401 before finalizing"},
    {"caseId": "IMP-046", "dimension": "D2-Determinism", "severity": "Medium", "issue": "Token capture via browser_evaluate may return null if storage key differs", "suggestedFix": "AUTO-FIXED: explicit assert non-empty JWT after capture step"},
    {"caseId": "IMP-045", "dimension": "D4-Testability", "severity": "Medium", "issue": "Tab 2 reload detection requires multi-tab tooling; difficult to assert deterministically", "suggestedFix": "Phase 5: qa-frontend-expert use browser_tabs + browser_wait_for to detect reload"},
    {"caseId": "IMP-043", "dimension": "D2-Determinism", "severity": "Medium", "issue": "Mobile menu toggle selector 'hamburger icon or equivalent' is not stable", "suggestedFix": "Phase 5: snapshot 375px mobile menu and record exact data-testid or ARIA role"},
    {"caseId": "IMP-040", "dimension": "D5-DataValidity", "severity": "Medium", "issue": "No @td() alias for member-without-security-account in test-data/aliases.json; precondition relies on manual Admin SPA lookup", "suggestedFix": "If vcst-qa has an invited-pending member, add alias IMP_TARGET_NO_ACCOUNT; otherwise mark Manual"},
    {"caseId": "IMP-039", "dimension": "D7-Duplication", "severity": "Low", "issue": "AUTH-028 covers the full journey; IMP-039 is the atomic visibility check — acceptable per framework but reviewer should note", "suggestedFix": "Acceptable — no fix needed"},
    {"caseId": "IMP-047", "dimension": "D5-DataValidity", "severity": "Low", "issue": "Hardcoded German locale assumption — vcst-qa may not have German enabled", "suggestedFix": "AUTO-FIXED: added locale-prefixed URL fallback in Steps"}
  ],
  "fixesApplied": [
    {"caseId": "IMP-046", "issue": "Token capture may silently return null", "fix": "Added [ASSERT] non-empty JWT string after browser_evaluate capture step"},
    {"caseId": "IMP-047", "issue": "Hardcoded German locale assumption", "fix": "Added 'or locale-prefixed equivalent' fallback in Steps"},
    {"caseId": "IMP-013", "issue": "Two logical blocks lacked readability separators", "fix": "Added --- UI ENTRY POINT CHECK --- and --- URL-BASED NESTING CHECK --- dividers"},
    {"caseId": "IMP-039", "issue": "Missing completeness assertion for existing actions", "fix": "Added [DOM] Other standard actions also present assertion"}
  ],
  "manualItems": [
    {"caseId": "IMP-012", "dimension": "D2", "issue": "Exact localStorage key for access_token on storefront not yet verified — needed before AC#6 assertion is reliable", "resolution": "Phase 5 browser_evaluate enumeration on live env"},
    {"caseId": "IMP-046", "dimension": "D4", "issue": "GET /api/account probe endpoint behavior with expired Bearer token not verified", "resolution": "Phase 5 qa-backend-expert curl test"},
    {"caseId": "IMP-045", "dimension": "D4", "issue": "Cross-tab broadcast detection requires live multi-tab orchestration", "resolution": "Phase 5 qa-frontend-expert browser_tabs verification"},
    {"caseId": "IMP-043", "dimension": "D2", "issue": "Mobile menu toggle selector ambiguous in current steps", "resolution": "Phase 5 375px viewport snapshot"},
    {"caseId": "IMP-040", "dimension": "D5", "issue": "No test data alias for member without security account", "resolution": "qa-seed-data or manual Admin SPA verification before automating"}
  ],
  "proposedInvariants": [
    {
      "draftId": "PROPOSED-BL-AUTH-012",
      "statement": "Upon revert-impersonation (backToOperator() in useImpersonate.ts), the impersonation access_token MUST be revoked server-side within the same request cycle. Any subsequent API call using the revoked token MUST return HTTP 401. The operator's own token (restored by the revert) MUST NOT be affected.",
      "coveredBy": "IMP-046",
      "status": "PROPOSED — requires user approval before promotion to business-logic.md"
    }
  ],
  "statistics": {
    "totalCasesInScope": 16,
    "valid": 1,
    "stale": 0,
    "incomplete": 3,
    "missing": 1,
    "broken": 0,
    "newGenerated": 10,
    "newInSuite082": 9,
    "newInSuite031": 1,
    "reviewFindings": {
      "Blocker": 0,
      "Critical": 0,
      "High": 1,
      "Medium": 4,
      "Low": 3
    },
    "autoFixed": 4,
    "manualRemaining": 5
  },
  "filesModified": [
    "regression/suites/Frontend/auth/082-auth-impersonation.csv",
    "regression/suites/Frontend/auth/031-auth-login-register.csv",
    "config/test-suites.json"
  ],
  "phase5VerificationTargets": [
    {
      "caseId": "IMP-042",
      "url": "{{FRONT_URL}}/company/members (then impersonate, observe header)",
      "priorityElementsToCheck": ["'Revert back to own account' in top-header during impersonation", "exact CSS selector or data-testid of revert link", "element is clickable and triggers revert flow"]
    },
    {
      "caseId": "IMP-046",
      "url": "{{FRONT_URL}}/account/impersonate/{userId} (silent flow), then revert",
      "priorityElementsToCheck": ["exact localStorage key storing access_token", "GET {{BACK_URL}}/api/account returns 200 pre-revert with Bearer token", "GET {{BACK_URL}}/api/account returns 401 post-revert with same Bearer token"]
    },
    {
      "caseId": "AUTH-028",
      "url": "{{FRONT_URL}}/company/members",
      "priorityElementsToCheck": ["'Login on behalf' in row actions dropdown (visible when CanImpersonate)", "confirmation modal renders with 'You are logging in on behalf of {email}. The session will be audited.'", "'Continue' button text and selector", "'Cancel' button text and selector"]
    },
    {
      "caseId": "IMP-039",
      "url": "{{FRONT_URL}}/company/members",
      "priorityElementsToCheck": ["'Login on behalf' dropdown item present when operator has CanImpersonate + target has security account", "exact label text (English)"]
    },
    {
      "caseId": "IMP-043",
      "url": "{{FRONT_URL}}/ at 375px viewport (after impersonation)",
      "priorityElementsToCheck": ["mobile menu hamburger toggle selector (data-testid or ARIA role)", "'Revert back to own account' item in open mobile menu (main-menu.vue)", "touch target size ≥44x44px"]
    },
    {
      "caseId": "IMP-041",
      "url": "{{FRONT_URL}}/company/members",
      "priorityElementsToCheck": ["confirmation modal Cancel button selector", "URL remains /company/members after Cancel", "no POST /connect/token issued after Cancel"]
    },
    {
      "caseId": "IMP-013",
      "url": "{{FRONT_URL}}/company/members (during impersonated session lacking CanImpersonate)",
      "priorityElementsToCheck": ["'Login on behalf' absent in row actions dropdown for impersonated session", "URL-based nesting /account/impersonate/{userId} shows form (not silent) for impersonated session"]
    }
  ]
}
```
