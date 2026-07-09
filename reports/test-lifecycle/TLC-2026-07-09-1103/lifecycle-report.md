# Test Case Lifecycle Report — TLC-2026-07-09-1103

## Summary
- **Input:** `suite 027b` (review, fix, verify)
- **Input Type:** direct-scope
- **Date:** 2026-07-09 11:03
- **Platform:** 3.1043.0
- **Theme:** n/a (Backend/Admin-SPA suite)
- **Module Versions:** VirtoCommerce.Customer `3.1014.0-alpha.1002-vcst-5239`, ProfileExperienceApiModule `3.1010.0-pr-137-5f46` (VCST-5239 whitelist feature live)
- **Suite:** `regression/suites/Backend/customer/027b-customer-org-roles.csv` (28 cases)
- **Verdict:** **APPROVED WITH WARNINGS**

## Phase Results

| Phase | Agent | Status | Key Metrics |
|-------|-------|--------|-------------|
| 1. Scope | orchestrator | Done | 1 suite, direct-scope; Sync+Generate skipped |
| 2. Sync | — | Skipped | direct scope |
| 3. Analyze & Generate | — | Skipped | direct scope |
| 4. Review & Fix | test-management-specialist | Done | 11 findings (B0/C3/H6/M2), 7 auto-fixed (12 cases), 4 manual |
| 5. Verify | qa-testing-expert | Done | 3 VERIFIED, 1 BLOCKED (ORGM-020); firefox→edge fallback |
| 6. Approve | orchestrator | **APPROVED WITH WARNINGS** | required gates pass; 2 cases held from promotion |

## Fixes Applied (Phase 4 — written to CSV)

| Case(s) | Dimension | Fix |
|---------|-----------|-----|
| ORGM-003 | Data Validity | Removed invalid `organizationId` from `changeOrganizationContactRole` command (schema = `memberId`+`roleIds` only; extra field would fail DV-006 before the permission check, invalidating the unauthorized-actor test) |
| ORGM-005/006/008/009/018/024 | BL coverage | `BL-AUTH-003` → `BL-AUTH-012` (column + inline; AUTH-003 explicitly scopes out VCST-5028 org-admin lockout) |
| ORGM-004 | BL coverage | `BL-B2B-001` → `BL-B2B-008` (org-scoped role-change isolation is the exact-match invariant) |
| ORGM-022/025/027 | Testability | Fixed 3 unparseable/misclassified runner predicates → valid `[COUNT].length>0` + `[DATA][?id=…]` / retagged cross-path & arithmetic from COUNT→DATA |
| ORGM-019b | Completeness | Filled empty Cleanup ("no cleanup required — already in reset state") |

Post-fix CSV re-validated: 15 cols / 28 rows / unique IDs. `config/test-suites.json` testCount=28 unchanged (no add/remove).

## Live Verification (Phase 5 — vcst-qa)

| Case | Result | Evidence |
|------|--------|----------|
| ORGM-019 | **VERIFIED** | Both fields present ("Organization roles whitelist" + "Membership roles whitelist"), editors + Add/Delete/Save work. `ORGM-019-roles-whitelist-fields.png` |
| ORGM-019b | **VERIFIED — defect reproduces** | Delete-all + Save → POST `allowedValues:[]`,`value:null` (204); follow-up GET returns `value:null`, `allowedValues:["Organization employee","Purchasing agent","Organization maintainer","org-maintainer"]` — all entries reappear. Failure_Signals match live behavior exactly. `ORGM-019b-01/02-*.png` |
| ORGM-020 | **BLOCKED** | No org-level Roles widget reachable on any org detail blade (org opens only as member-list; "Change roles" disabled for orgs). Feature is live but not at the location the case describes. `ORGM-020-org-blade-full.png` |
| ORGM-021 | **VERIFIED (names) — but dropdown UNFILTERED** | Role editor renders roles by NAME (confirms ID→name edits); dropdown shows ALL system roles, NOT limited to the whitelist — matches VCST-5239 F1 (Admin SPA dropdown unfiltered by design). Case's filter-assertion does not hold live. `ORGM-021-change-roles-dropdown.png` |

**Browser note:** playwright-firefox timed out on the Admin-SPA ui-grid/Select2 controls (pre-existing AngularJS `vendor.js` `scrollWidth` TypeError during blade animation); switched to playwright-edge. Console/network baseline otherwise benign (3 module-logo 404s only; no 4xx/5xx on any roles/settings op).

## Quality Gates

| Gate | Status | Detail |
|------|--------|--------|
| G1 Structure | **PASS** | 15 cols / 28 rows / unique IDs post-fix |
| G2 Determinism | **WARN** | ORGM-001 runs as ADMIN_DEFAULT but title claims maintainer-actor (no Critical left after predicate fixes) |
| G3 Completeness | **PASS** | empty Cleanup fixed; whitelist group lacks a negative case (gap note) |
| G4 Testability | **PASS** | all predicates now valid runner grammar |
| G5 Data Validity | **PASS** | ORGM-003 schema violation fixed; no hardcoded URLs/GUIDs/creds |
| G6 BL/ECL Coverage | **WARN** | BL-* IDs corrected; suite-wide ECL-* mislabels unresolved (no fitting library category) |
| G7 Duplication | **FAIL (recommended)** | ORGM-001 ≈ ORGM-002 as authored |
| G8 Environment | **WARN** | 0 BROKEN; ORGM-019/019b/021 VERIFIED; ORGM-020 BLOCKED (unreachable UI); ORGM-021 oracle contradicts by-design F1 |
| G9 Sync | **SKIP** | direct scope |

Required gates (G1–G5, G8) pass (G2/G8 with warnings) → **APPROVED WITH WARNINGS**.

## Remaining Items

### Must Fix before promoting the affected cases (need author decision)
| Case | Issue | Suggested action |
|------|-------|------------------|
| ORGM-020 | Describes an org-level Roles widget not reachable in this build; premise (admin dropdown filtered by whitelist) contradicts F1 | Confirm real entry point for org-level role assignment, or re-scope to API/GraphQL, or move whitelist-filtering to the storefront suite. **Hold from promotion.** |
| ORGM-021 | Admin membership dropdown is unfiltered **by design** (F1); the "limited to whitelist" assertion fails live | Demote the filter-assertion to an observation ("admin dropdown unfiltered by design — F1"); move whitelist-filtering coverage to the storefront (vc-frontend#2354). Remove "shows all system roles" from Failure_Signals. |
| ORGM-001 | Title claims maintainer-actor but runs as ADMIN_DEFAULT → duplicates ORGM-002 (real maintainer path = ORGM-017) | Retitle to match actual coverage, or re-scope to a genuinely distinct permitted actor. **Hold from promotion.** |

### Should Fix (quality)
- **Suite-wide ECL-* mismatch** — Edge_Case_Refs don't match `e-commerce-edge-cases-library.md` categories (template copy-paste). No fitting RBAC/settings-whitelist ECL category exists → file a follow-up to add an "RBAC & Permission Edge Cases" domain, or drop the refs where no match exists.
- **Whitelist group missing a negative case** — 019/019b/020/021 have positive+boundary but no negative (e.g. add a non-existent role) → next generation pass.
- **Doc drift (informational):** Context7/VirtoOZ show `userId` for `changeOrganizationContactRole` while live introspection + the suite use `memberId` → doc-refresh ticket (suite is correct; unchanged).

## Files Modified
- `regression/suites/Backend/customer/027b-customer-org-roles.csv` (7 auto-fixes across 12 cases)

## Next Steps
- [ ] Decide ORGM-020 real entry point / re-scope; ORGM-021 assertion demotion; ORGM-001 retitle — then promote Draft→Reviewed for the remaining 25/28
- [ ] Run `/qa-regression customer` (or targeted 027b) after the 3 cases are resolved
- [ ] File the whitelist clear-to-empty defect (ORGM-019b guards it) if not already tracked
- [ ] Follow-ups: ECL library "RBAC" domain; `changeOrganizationContactRole` doc refresh
