# Test Case Lifecycle Report — TLC-2026-06-15-1213

## Summary
- **Input:** VCST-5028
- **Input Type:** change-source (JIRA Story + 3 linked PRs, all OPEN + deployed to vcst-qa)
- **Date:** 2026-06-15 12:13
- **Platform:** 3.1037.0
- **Theme:** 2.51.0-pr-2315
- **Module Versions:** Customer 3.1010.0-pr-300 · ProfileExperienceApi 3.1008.0-pr-135
- **Verdict:** ✅ **APPROVED WITH WARNINGS**

Feature: per-organization roles & access control — roles and lockout move from **global** (`ApplicationUser`) to **org-scoped** via a new `OrganizationMembership` entity in `vc-module-customer`. JWT carries an org claim set at login; permissions = global role + the logged-into-org's roles.

## Phase Results

| Phase | Agent | Status | Key Metrics |
|-------|-------|--------|-------------|
| 1. Scope | orchestrator | Done | 7 suites affected; 3 deployed PRs; GraphQL shapes + REST route captured |
| 2. Sync | test-management-specialist | Done | 10 cases updated (global→org-scoped); 0 broken/deprecated |
| 3. Analyze & Generate | test-management-specialist | Done | 6 gaps (AC1–AC5 + regression guard); 15 cases created |
| 4. Review & Fix | test-management-specialist | Done | 7/7 dimensions PASS; route + `contactId→memberId` fixes |
| 5. Verify | qa-testing-expert (Edge) | Done | 3/3 targets VERIFIED; 1 label-CHANGED (folded back) |
| 6. Approve | orchestrator | **APPROVED WITH WARNINGS** | Gates: 9/9 required PASS |

## Change Inventory
| Module/Repo | Layer | Key changes | Breaking |
|-------------|-------|-------------|----------|
| vc-module-customer #300 | backend + Admin SPA + auth | `OrganizationMembership` entity/service/`OrganizationMembershipController`, DB migrations, OpenIddict org-claim (login carries org), "Organization memberships" widget | Role/lockout semantics global→org-scoped |
| vc-module-profile-experience-api #135 | xAPI/GraphQL | `changeOrganizationContactRole` / `lockOrganizationContact` / `unlockOrganizationContact`; `ProfileAuthorizationHandler`, `ContactType` | OrgId derived from session, not arg |
| vc-frontend #2315 | storefront | `/company/members` per-org Edit role + Block/Unblock; org-scoped sign-in; identity-error messaging | — |

## Acceptance Criteria → Coverage
| AC | Description | Covered by |
|----|-------------|-----------|
| AC1 | Per-org role scope (JWT = global + logged-into-org roles) | B2C-MBR-019, PRF-GQL-066/067 |
| AC2 | Storefront role change visible per org | B2C-MBR-019 |
| AC3 | Per-org lockout (blocked in org B, can login to org A) | B2C-MBR-020/021, AUTH-065, PRF-GQL-068/069 |
| AC4 | Cross-org maintainer denied (privilege-escalation guard) | B2C-MBR-022, AUTH-066, PRF-GQL-070 |
| AC5 | Admin "Organization memberships" widget + REST | CUST-085/086/087, PLAT-084 |

## Sync Results (Phase 2)
| Case | Suite | Classification | Action |
|------|-------|---------------|--------|
| B2C-MBR-008/011 | 008 | STALE | Org-scope flow + verified selectors (`Actions`→`Edit role`) |
| B2C-MBR-010 | 008 | STALE | Two-org block isolation; "global block" failure signal |
| B2C-MBR-009/012 | 008 | INCOMPLETE | TechFlow-admin/blocked-member preconditions |
| AUTH-021 | 031 | STALE | Org-context note; BL-AUTH-003 added |
| CUST-063/064 | 027 | INCOMPLETE | Empty Steps/Assertions/Cross_Layer filled |
| PLAT-009/010 | 020 | VALID | Regression-guard NOTE: platform (global) lock ≠ org lock |

## New Cases Generated (15)
| ID | Suite | Layer | Priority |
|----|-------|-------|----------|
| B2C-MBR-019/020/022 | 008 | Storefront | Critical |
| B2C-MBR-021 | 008 | Storefront | High |
| AUTH-065/066 | 032 | Storefront/xAPI | Critical |
| PLAT-084 | 020 | Admin SPA | High |
| CUST-085 | 027 | Admin SPA | High |
| CUST-086/087 | 027 | REST API | High |
| PRF-GQL-066/067/068/070 | 050d | GraphQL runner | Critical |
| PRF-GQL-069 | 050d | GraphQL runner | High |

## Quality Gates
| Gate | Status | Details |
|------|--------|---------|
| G1 Structure | ✅ PASS | CSV valid, IDs unique (CUST-074/075/076 → 085/086/087 conflict resolved) |
| G2 Determinism | ✅ PASS | Storefront cases use verified selectors/labels (`Actions`→`Edit role`/`Block user`, `[data-test-id]` sign-in) |
| G3 Completeness | ✅ PASS | errors[] checks, cleanup, failure signals present |
| G4 Testability | ✅ PASS | Falsifiable assertions; per-org isolation asserted |
| G5 Data Validity | ✅ PASS | `validate-td-refs` 0 failures; GraphQL validated (`memberId` not `contactId`; route `/api/customer/organization-memberships`) |
| G6 Coverage | ✅ PASS | BL-B2B-005 / BL-AUTH-003 mapped on P0/P1 |
| G7 Duplication | ✅ PASS | Deduped vs existing org-member cases |
| G8 Environment | ✅ PASS | Phase 5: all 3 surfaces VERIFIED on vcst-qa |
| G9 Sync | ✅ PASS | 10 STALE/INCOMPLETE updated; 0 BROKEN |

## Environment Verification (Phase 5)
| Target | Result | Notes |
|--------|--------|-------|
| Storefront `/company/members` | VERIFIED | Per-row `Actions`→`Edit role`/`Block user`/`Delete`; inline `Active`/`Blocked` toggle; own-row suppressed; 11-org switcher |
| Admin contact "Organization memberships" widget | VERIFIED | Grid Organization/Roles/Status + Refresh/Add/Delete; separate from legacy "Member of company(ies)" |
| Console baseline | VERIFIED | No feature-related JS/network errors |

## Remaining Items (Warnings — do not block, address before regression)
| Item | Severity | Action |
|------|----------|--------|
| **Test-data gap:** AC1/AC3 cross-org cases (B2C-MBR-019/020, PRF-GQL-067) need ONE member in BOTH target orgs. Multi-org user is in BMW-Group/AcmeCorp + TechFlow, **not BuildRight**. | High | Enroll multi-org user in the 2nd org via `/qa-seed-data b2b` before running |
| CUST-086 POST payload shape (`memberId`/`organizationId`/`roleIds`) | Should-fix | Confirm against `OrganizationMembership` model when executing (route now correct) |

## Files Modified
- `regression/suites/Frontend/b2c/008-b2c-members.csv` — 5 synced + 4 new (B2C-MBR-019..022)
- `regression/suites/Frontend/auth/031-auth-login-register.csv` — 1 synced (AUTH-021)
- `regression/suites/Frontend/auth/032-auth-session-rbac.csv` — 2 new (AUTH-065..066)
- `regression/suites/Backend/customer/027-customer-orgs-invites.csv` — 2 synced + 3 new (CUST-085..087)
- `regression/suites/Backend/platform/020-platform-users-roles-settings.csv` — 2 synced + 1 new (PLAT-084)
- `regression/suites/Backend/graphql/050d-graphql-xprofile.csv` — 5 new (PRF-GQL-066..070)

## Next Steps
- [ ] `/qa-seed-data b2b` — enroll the multi-org user into the 2nd org for cross-org cases
- [ ] Run `/qa-regression 008,032,031,027,020,050d` (or `b2c`+`auth` groups) — all 15 new cases are `Draft`
- [ ] Promote `Draft` → `Reviewed` after the first green run (qa-lead-orchestrator)
- [ ] When VCST-5028 PRs merge, re-confirm GraphQL/REST contracts (mutations validated against pre-merge live schema)
