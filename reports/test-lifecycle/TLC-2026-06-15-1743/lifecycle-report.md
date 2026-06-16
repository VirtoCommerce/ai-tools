# Test Case Lifecycle Report — TLC-2026-06-15-1743

## Summary
- **Input:** VCST-5028 — "Update / add new scenarios" from `reports/ba/ba-report-VCST-5028-2026-06-15.md`
- **Input Type:** change-source (BA report → complete E2E user-flow scenarios)
- **Date:** 2026-06-15 17:43
- **Platform:** 3.1037.0 · **Theme:** 2.51.0-pr-2315 · **Modules:** Customer 3.1010.0-pr-300 · ProfileExperienceApi 3.1008.0-pr-135
- **Verdict:** ✅ **APPROVED WITH WARNINGS**

This run is the **complete-user-flow** follow-up to TLC-2026-06-15-1213. That run added 25 **atomic per-AC** cases (single role change, single block, cross-org guard, admin-widget CRUD, GraphQL field/mutation probes). This run adds the **4 composite end-to-end journey scenarios** the BA report's 6 flows + 9 stories call for — chaining the full lifecycle rather than asserting one operation.

## Phase Results

| Phase | Agent | Status | Key Metrics |
|-------|-------|--------|-------------|
| 1. Scope | orchestrator | Done | 3 suites; change source = BA report; dedup baseline = TLC-1213's 25 atomic cases |
| 2. Sync | — | **Skipped** | Already synced today by TLC-1213 (10 cases) — not repeated |
| 3. Analyze & Generate | test-management-specialist | Done | 4 complete E2E journeys created (gap = no full-lifecycle scenarios existed) |
| 4. Review & Fix | test-management-specialist | Done | 7/7 dimensions PASS; 0 blockers / 0 criticals |
| 5. Verify | — | **Skipped (rationale)** | Storefront write path blocked by BUG-A + stale PR#135 (`MISSING_METHOD`); live walk would re-surface a known blocker. Cases = Draft. |
| 6. Approve | orchestrator | **APPROVED WITH WARNINGS** | Required gates pass; warnings carried from BA report |

## New Cases Generated (4 complete journeys)

| ID | Suite | Journey | Priority | BL refs (final IDs) |
|----|-------|---------|----------|---------------------|
| **B2C-MBR-023** | 008-b2c-members | Maintainer full member-governance lifecycle: invite → role edit → block → cross-org login isolation → unblock → remove (8 screens) | Critical | BL-B2B-007/008/009, BL-AUTH-012/013, BL-B2B-005, BL-AUTH-003 |
| **AUTH-067** | 032-auth-session-rbac | Multi-org member lived experience: TechFlow maintainer → switch to BuildRight employee → permission isolation → blocked in BuildRight → TechFlow unaffected → unblock restore (8 screens) | Critical | BL-B2B-007/008, BL-AUTH-012/013, BL-B2B-001/005, BL-AUTH-003 |
| **CUST-088** | 027-customer-orgs-invites | Admin/support remediation: unlock one-org membership via Admin SPA widget → REST verify only that membership flipped → global account untouched (4 layers) | Critical | BL-AUTH-012/013, BL-AUTH-003, BL-B2B-005 |
| **CUST-089** | 027-customer-orgs-invites | Invite-to-active onboarding: maintainer invites with org role → appears in members → REST + xAPI confirm `OrganizationMembership`, global roles unchanged (4 layers) | High | BL-B2B-009/007, BL-B2B-005, BL-AUTH-001 |

**Dedup:** all four chain/extend the TLC-1213 atomic cases (B2C-MBR-019..022, AUTH-065/066, CUST-085/086/087) without restating their step assertions. CUST-089 (invite→REST→storefront→xAPI round-trip) is entirely new.

## BL Coverage — references corrected to promoted final IDs
The specialist authored against `PROPOSED-BL-*`; this orchestrator **replaced the 5 promoted IDs with their final IDs** (the invariants were promoted to `business-logic.md` earlier this session): `BL-AUTH-012`, `BL-AUTH-013`, `BL-B2B-007`, `BL-B2B-008`, `BL-B2B-009` — in both the `Business_Rule` column and inline step text across the 3 files. Verified 0 stale `PROPOSED-BL-(AUTH-01[23]|B2B-00[789])` refs remain. (Unrelated `PROPOSED-BL-QUOTE/RTN/SEC` in other suites untouched.)

## Quality Gates

| Gate | Status | Details |
|------|--------|---------|
| G1 Structure | ✅ PASS | 15-col CSV valid; IDs unique (B2C-MBR-023, AUTH-067, CUST-088/089) |
| G2 Determinism | ✅ PASS | Verified selectors/labels reused from B2C-MBR-019 conventions; multi-screen `[NAV]/[ACT]/[WAIT]/[ASSERT]` |
| G3 Completeness | ✅ PASS | Preconditions, Cross_Layer_Checks, Failure_Signals, Cleanup (fixture-restoring) present on all 4 |
| G4 Testability | ✅ PASS | Falsifiable; per-org isolation + global-account guard asserted; BUG-A distinguished from true failure in Failure_Signals |
| G5 Data Validity | ✅ PASS | `validate-td-refs` 2704/2704 resolved, 0 fail; no hardcoded GUIDs |
| G6 Coverage | ✅ PASS | New BL-AUTH-012/013 + BL-B2B-007/008/009 mapped across all P0 journeys |
| G7 Duplication | ✅ PASS | Composite journeys, no same-layer dup of the atomic cases |
| G8 Environment | ⏭️ SKIP | Phase 5 not run (known blocker) — not evaluated |
| G9 Sync | ✅ PASS (N/A) | Sync owned by TLC-1213; no STALE/BROKEN introduced here |

## Remaining Items (Warnings — do not block; resolve before regression)

| Item | Severity | Action |
|------|----------|--------|
| **BUG-A blocks storefront execution** of B2C-MBR-023 & AUTH-067 (maintainer Invite/Action UI hidden; xAPI mutations `MISSING_METHOD`). | High | Cases carry `[NOTE]` + BUG-A-distinguishing Failure_Signals. Execute after the `me`/GetPageContext fix + a complete PR#135 redeploy. CUST-088 (Admin-SPA/REST) is the executable route meanwhile. |
| **Cross-org test-data** (carried from TLC-1213): cases need a member in BOTH target orgs; `MULTI_ORG_TF_BR` covers TechFlow+BuildRight. | High | Confirm fixture seeded/clean via `/qa-seed-data b2b` before running. |
| CUST-089 invite uses a `<new_contact_id>` captured live (live-discover) | Should-fix | Confirmed correct pattern; verify capture step on first execution. |

## Files Modified
- `regression/suites/Frontend/b2c/008-b2c-members.csv` — +1 (B2C-MBR-023); testCount 18→19
- `regression/suites/Frontend/auth/032-auth-session-rbac.csv` — +1 (AUTH-067); testCount 12→13
- `regression/suites/Backend/customer/027-customer-orgs-invites.csv` — +2 (CUST-088/089); testCount 33→35
- `config/test-suites.json` — testCount updates for 008/027/032

## Next Steps
- [ ] Land BUG-A fix + complete PR#135 redeploy, then execute B2C-MBR-023 / AUTH-067 storefront journeys
- [ ] `/qa-seed-data b2b` — ensure `MULTI_ORG_TF_BR` clean in both orgs
- [ ] `/qa-regression 008,032,027` (or run CUST-088 now — Admin-SPA/REST path is unblocked)
- [ ] Promote `Draft → Reviewed` after first green run
