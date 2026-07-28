# Test Case Lifecycle Report — TLC-2026-07-24-1906

## Summary
- **Input:** `module Sales Rep + frontend Sales Rep feature`
- **Input Type:** change-source (new module + FE feature, Sprint 26-14)
- **Date:** 2026-07-24 19:06
- **Platform:** 3.1048.0
- **Sales Rep module:** `VirtoCommerce.SalesRep 3.1000.0-pr-4-6596` (brand-new, PR prerelease)
- **Theme:** vc-theme-b2b-vue `2.54.0-pr-2395`
- **Key modules:** Xapi 3.1015.0, ProfileExperienceApi 3.1012.0, Customer 3.1020.0, XOrder 3.1007.0, Orders 3.1013.0, Store 3.1006.0
- **Verdict:** **NEEDS FIXES** (this run's own deltas are clean; the failing gates are pre-existing 092 debt + items correctly held pending a deploy/dev confirmation)

## Phase Results

| Phase | Agent | Status | Key Metrics |
|-------|-------|--------|-------------|
| 1. Scope | orchestrator | Done | 5 suites (089/090/091/092/050m); 134 existing cases; change-driven from 8 tickets + PRs |
| 2. Sync | test-management-specialist | Done | 25 enum fixes applied; 3 STALE + 2 BROKEN flagged (held for deploy/dev confirmation) |
| 3. Analyze & Generate | test-management-specialist | Done | 7 gaps; 12 Draft cases staged (not in prod suites); schema drift exposed |
| 4a/4b. Review & Fix | test-management-specialist | Done | 107 → 82 findings after fixes (1 Blocker + 25 enum resolved) |
| 4c. BL Audit | orchestrator (`/qa-review-bl` scope) | Done | 3 candidates verified; **1 promoted (BL-SREP-002)** under the applicable-axes bar (live + source met; docs N/A); 2 held (drafts) |
| 5. Verify | qa-testing-expert (firefox/edge) | Done | 2 VERIFIED, 1 CHANGED, 1 CONFLICT (deploy lag), 1 BLOCKED |
| 6. Approve | orchestrator | **NEEDS FIXES** | Gates: 3 PASS / 2 FAIL / 3 WARN / 1 partial |

## Change Inventory
| Area | Detail |
|------|--------|
| New module | `vc-module-sales-rep` (#2 X-API endpoints, #3 push/email, #5 mediators-per-request) + `vc-module-x-api` #76/#77 |
| Frontend | vc-frontend #2378/#2380/#2383/#2388 (+ **#2391** VCST-5494 fix, merged to dev but **not on the vcst-qa artifact**) |
| Layers | backend (module + scoped `/graphql/sales-rep`), admin (VC-Shell embedded app), storefront (hub: My Customers, My Sales Reps, Customer Profile, Dashboard) |
| Tickets | VCST-4907/5304/5293/5409/5469/5494/5485/5308 |
| Breaking | GraphQL: `salesRepOrderStatuses` **removed** → `salesRepOrderFilterRules`/`salesRepOrderSortRules` + `salesRepOrders(filter:)` |

## Sync Results
| Case(s) | Suite | Classification | Action |
|---------|-------|---------------|--------|
| 12 rows | 091 | enum `verified`→`Reviewed` | **Fixed** (S-006) |
| 13 rows | 092 | enum `verified`→`Reviewed` (1 reverted to Draft) | **Fixed**; SR-ADM-016 → Draft (held ungrounded `{HYPOTHESIS}`, GRD-001) |
| SR-FE-013, SR-FE-021 | 089 | **STALE-pending-deploy** | Held — assert redirect-as-intended; correct once #2391 deploys (see 4c) |
| SR-GQL-033/034 | 050m | **BROKEN** (`salesRepOrderStatuses` gone) | Held for dev confirmation — do not auto-rewrite |
| SR-CP-009/010/011 | 091 | **STALE** (op renamed) | Held — retarget to `salesRepOrderFilterRules`/`salesRepOrders(filter:)` |
| SR-FE-MSR-014/015 | 090 | INCOMPLETE (data-gap) | Blocked pending fixtures |

## New Cases Generated (12, Draft — `reports/tickets/Sprint26-14/gap-cases-sales-rep.csv`, not in prod suites)
SR-GQL-042…049 (8× scoped `salesRep*` query coverage — dashboard KPIs, filter/sort rules), SR-ADM-023 (non-Sales-Rep-role admin RBAC, fixture-blocked), SR-FE-031 (VCST-5494 definitive repro), SR-FE-032/033 (Dashboard existence + KPI reconciliation). GraphQL cases validated against the refreshed `graphql-schema.md`; unconfirmed behavior tagged `{HYPOTHESIS}`.

## Environment Verification (Phase 5)
| Target | Result | Evidence |
|--------|--------|----------|
| #1 SR-FE-031 / VCST-5494 (no-membership hub) | **CONFLICT — outcome (i) redirect** | Customer-less rep's hub links show but **redirect to `/account/dashboard`**. `me.permissions:["sales-rep:access"]`, `organizations.totalCount:0`. **Fix (#2391) not on the deployed artifact** — see below. Screenshots captured. |
| #2 SR-FE-032/033 / VCST-5485 (Dashboard) | **VERIFIED** | `/company/dashboard` distinct hub entry; KPI widgets render **real** data (orders 10/$987, week/mtd/ytd 13/$1,322; 7 served customers). |
| #3 091 SR-CP-009/010/011 (status chips) | **CHANGED** | Chips work via **`salesRepOrderFilterRules`** + `salesRepOrders(filter:"New")` (200, 10 results); `salesRepOrderStatuses` absent. |
| #4 091 SR-CP-015 (KPIs) | **VERIFIED** | `salesRepCustomerOrderStatistics` reconciles exactly — KPIs are **real, not mock**. |
| #5 SR-ADM-023 (embedded RBAC) | **VERIFIED** (post-run unblock, 2026-07-24) | Blocker cleared — 4 restricted fixtures seeded via `seed:rbac`; a **5-account API matrix** confirmed the `SalesRepController` `[Authorize]` gate (read=`customer:read`; account-ops=`platform:security:update` only; CRUD=customer:* AND platform:security:*; non-admin FULL passes). `BL-SREP-003` promoted. Evidence: `reports/tickets/Sprint26-14/VCST-5293/screenshots/`. |

**Deployment gap (root cause of #1 conflict):** vcst-qa theme `2.54.0-pr-2395` is a PR-branch build that does **not** contain PR #2391 (VCST-5494 fix, merged to dev 07-23); its deploy PR `vc-deploy-dev#6164` is still open/unmerged. Live correctly shows pre-fix behavior for the pinned artifact (`feedback_pr_deploy_workflow`).

## Quality Gates
| Gate | Status | Details |
|------|--------|---------|
| G1 Structure | **PASS** | Blocker (092 GRD-001) resolved by reverting SR-ADM-016 → Draft; 25 enum literals fixed |
| G2 Determinism | **FAIL** | 092 retains **29 Critical** D-004/D-001 (compound-step) — **pre-existing systemic debt**, not this run's regression |
| G3 Completeness | **FAIL** | >3 High across 090/091/092 — mostly pre-existing vague-DOM/element-ref items |
| G4 Testability | **PASS** | No testability-dim Critical findings |
| G5 Data Validity | **PASS** (cases) / ⚠ fixture | CSV `@td()`/`{{VAR}}` clean; **but** SR fixture credential drift (below) is a must-fix data defect |
| G6 Coverage / BL | **WARN** | 4c surfaced 3 candidates; the one conflict (SREP-001) is documented + routed + re-audit-triggered, not silently unresolved; 0 auto-applied by policy |
| G7 Duplication | **WARN** | 089 3× DUP-001 (likely intentional layer variations) |
| G8 Environment | **WARN** | 0 test-BROKEN, but the headline VCST-5494 path is **unverifiable (fix not deployed)** and SR-ADM-023 BLOCKED (fixture) |
| G9 Sync | **PARTIAL** | Enum STALE fixed; behavioral STALE/BROKEN (089 redirect, `salesRepOrderStatuses` rename) **deliberately held** pending deploy/dev confirmation |

## Remaining Items

### Must Fix (blocks a clean regression)
1. **Deploy the VCST-5494 fix to vcst-qa** — get PR #2391's artifact onto the env (via `/qa-deploy-pr` or merge `vc-deploy-dev#6164`), then re-verify the no-membership hub path. Unblocks 089 SR-FE-013/021 correction + SREP-001 promotion.
2. **Reconcile SR fixture credentials** — deployed `SR_REP_*` accounts authenticate with `Password1!`, but `user-roles.mjs` maps `SALES_REP.passwordVar=TEST_USER_PASSWORD`; a headless `@td()`+secrets run will 400 `invalid_grant`. Fix registry/seed (`reference_seed_password_tokens`).
3. **Retarget the removed-query cases** — 050m SR-GQL-033/034 + 091 SR-CP-009/010/011 to `salesRepOrderFilterRules`/`salesRepOrders(filter:)` (live-confirmed) via `/qa-review-tests --fix`.
4. **Author blocking fixtures** (`test-data-engineer`): `RESTRICTED_ADMIN_NO_SALES_REP_ROLE` (SR-ADM-023/SREP-003), rep-heavy org >10 reps + zero-rep org (090 SR-FE-MSR-014/015).

### Should Fix
- Dedicated **step-splitting pass on 092** (29 pre-existing compound-step Criticals) — bounded, do not fold into a sync.
- Promote the 12 Draft gap cases into prod suites after the deploy + re-verify.
- Add a **cross-org negative** for SREP-002 (Dashboard scope-isolation).
- Housekeeping: add Sales Rep entries to `feature-domain-map.md`.

## Files Modified
- `regression/suites/Frontend/sales-rep/091-sales-rep-customer-profile-storefront.csv` — 12 enum normalizations
- `regression/suites/Backend/sales-rep/092-sales-rep-admin-embedded-app.csv` — 13 enum normalizations (1 revert to Draft)
- `reports/tickets/Sprint26-14/gap-cases-sales-rep.csv` — **new**, 12 Draft gap cases
- `.claude/knowledge/api/graphql-schema.md` — refreshed (pre-flight)
- `.claude/knowledge/oracles/business-logic.md` — **BL-SREP-002 promoted** (new Domain 20: Sales Rep), body-only

## BL Audit
Triangulated 3 candidates (scoped to this run) under the **applicable-axes** evidence bar: Sales Rep is a new/undocumented/pre-GA module, so the **docs axis is waived (N/A)** — not a permanent blocker — and a candidate promotes when the axes that CAN be verified (**live + source**) are both met and agree.
- **PROMOTED → `business-logic.md` as BL-SREP-002** (Domain 20: Sales Rep) — dashboard statistics scoped to the rep's served orgs; live CONFIRMS (real data, exact reconcile) + source CONFIRMS (scoped resolvers).
- **PROMOTED → `business-logic.md` as BL-SREP-003** (post-run) — embedded admin app gates on customer-member + platform-security perms (full controller matrix incl. account-ops class + AND semantics); blocker cleared by seeding restricted fixtures, then the 5-account API matrix + source CONFIRM. Body-only; Coverage Summary table + frontmatter count (145→**147**) need a separate bump.
- **Held (draft):** SREP-001 (hub access) — live *contradicts* source **only due to deploy lag** (VCST-5494 fix #2391 not on the pinned artifact); promote once it deploys and live flips.
- Drafts + evidence + re-audit triggers: `reports/ba/bl-proposals-2026-07-24.md`. Audit trail: `reports/knowledge/BL-AUDIT-2026-07-24.md`.

## Next Steps
- [ ] Deploy PR #2391 to vcst-qa → re-verify no-membership hub → correct 089 SR-FE-013/021
- [ ] Reconcile SR fixture credentials + author the 2 blocking fixtures
- [ ] `/qa-review-tests --fix` the `salesRepOrderStatuses`→`FilterRules` rename (5 cases)
- [ ] Promote the 12 Draft gap cases; then `/qa-regression sales-rep`
- [ ] BL-SREP-002 promoted; separately bump the oracle's Coverage Summary table + frontmatter count (145→146). Re-audit the 2 held drafts (SREP-001 after #2391 deploys; SREP-003 after the restricted-admin fixture)
