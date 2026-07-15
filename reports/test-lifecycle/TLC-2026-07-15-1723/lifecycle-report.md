# Test Case Lifecycle Report — TLC-2026-07-15-1723

## Summary
- **Input:** `VCST-5293` + PR #2 `VirtoCommerce/vc-module-sales-rep` (X-API endpoints for customers and sales reps)
- **Input Type:** change-source (JIRA story + linked PR)
- **Date:** 2026-07-15 17:23 UTC
- **Env (verification):** vcptcore-qa @ Platform 3.1043.0, SalesRep `3.1000.0-pr-2-e6e9`, theme 2.54.0-pr-2380 — the **only** env where PR #2 is deployed (absent on vcst-qa / virtostart)
- **Verdict:** **APPROVED WITH WARNINGS**

New module `vc-module-sales-rep` with **zero prior regression coverage**. PR #2 is **open** (base `dev`), tickets VCST-4907/5304/5308 under parent story VCST-5293. Change is overwhelmingly a new **GraphQL xAPI** surface on a scoped schema `POST /graphql/sales-rep`. One new suite authored (`050m`, 35 cases); its entire query/arg/field/auth contract is **verified live** against the deployed build; data-driven behavior cases are blocked pending seed.

## Phase Results

| Phase | Agent | Status | Key Metrics |
|-------|-------|--------|-------------|
| 1. Scope | orchestrator | Done | 1 new suite; layer = GraphQL xAPI (scoped) |
| 2. Sync | — | Skipped | New module, no existing cases to sync |
| 3. Generate | test-management-specialist | Done | 35 cases across 5 queries |
| 4. Review & Fix | test-management-specialist | Done | 7-dim review; auto-fixed 10 Failure_Signals + 4 var bindings |
| 5. Verify | orchestrator (API-level) | Partial | Contract VERIFIED live; 29 data cases BLOCKED (no seed) |
| 6. Approve | orchestrator | **APPROVED WITH WARNINGS** | Gates 6 PASS / 1 WARN / 2 N-A |

## Change Inventory
| Area | Layer | Change |
|------|-------|--------|
| `ExperienceApi/*` (Queries, Schemas, Models, Services) | GraphQL xAPI | **New** scoped schema `POST /graphql/sales-rep` (GraphiQL `/ui/graphiql/sales-rep`) — 5 queries |
| `Data/Services/SalesRep*Service`, new `SalesRepCustomerOrderSearchService` | Backend C# | Search/service layer feeding the queries |
| `Web/App/.../sales-reps-list.vue`, `useSalesRepListUI` | Admin (VC-Shell/Vue) | Minor list-UI tweaks (not the focus) |
| `tests/.../SalesRepGraphQlComponentTests.cs` (+782) | Tests | 30 xUnit component tests — used as the authoritative contract |

**5 queries (VCST-4907/5304/5308):** `customerSalesReps`, `salesRepCustomers`, `salesRepCustomer(id)`, `salesRepOrders`, `salesRepOrderStatuses`.

## Coverage Delta
| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| Sales-rep suites | 0 | 1 (`050m`) | +1 |
| Sales-rep cases | 0 | 35 | +35 |
| Candidate invariants mapped | 0 | 7 of 8 (PERM not xAPI-observable) | +7 |

## New Cases Generated
`regression/suites/Backend/graphql/050m-graphql-sales-rep.csv` — SR-GQL-001…035, `Automation_Status: Draft`.
Q1 customerSalesReps ×8 · Q2 salesRepCustomers ×6 · Q3 salesRepCustomer(id) ×7 · Q4 salesRepOrders ×11 · Q5 salesRepOrderStatuses ×2 · store-setting (UITOGGLE) ×1.

## Live Verification (Phase 5 — API level, no seed required)
| Check | Result |
|-------|--------|
| `/graphql/sales-rep` deployed & wired | ✅ HTTP 200 |
| Anonymous query → authorization error | ✅ `"Anonymous access denied…"` code `Unauthorized`, `data:null` — confirms **BL-SR-AUTH** + cases SR-GQL-002/010/018/025/034 |
| Query names + args match contract | ✅ exactly 5 queries; `salesRepCustomer(id)` arg is **`id`** (README prose "organizationId" is wrong); `salesRepOrders` all 8 args match |
| Return-type fields match case selections | ✅ SalesRepContact / SalesRepCustomer(+lastOrder) / SalesRepCustomerDetails / SalesRepOrder / SalesRepOrderStatus / *Connection — every selected field exists live |
| GraphiQL UI `/ui/graphiql/sales-rep` | ✅ HTTP 200 |
| `salesRepCustomerOrderStatistics` (README) | ❌ **not present** on live schema → confirms README documents an unimplemented query |

**BLOCKED (29 cases):** SR-GQL-001,003-009,011-017,019-024,026-032,035 assert on scoped **data** (which reps/orgs/orders return, ordering, hydration, localization, lock exclusion) — require a seeded sales-rep + served orgs + orders on vcptcore-qa. Data-availability block, **not** a test defect. Verifiable-today subset: 002,010,018,025,033,034.

## Quality Gates
| Gate | Status | Details |
|------|--------|---------|
| G1 Structure | PASS | 35/35 rows, 15 cols, unique IDs |
| G2 Determinism | PASS | Legacy GraphiQL step tags; no compound steps |
| G3 Completeness | PASS | +10 Failure_Signals, +4 var bindings auto-fixed |
| G4 Testability | PASS | No vague predicates |
| G5 Data Validity | **WARN** | 95/96 `@td()` resolve; 5 new `SR_REP_*` aliases + `STORE_ID_SECONDARY` unauthored (by-design for a new module needing seed) — proper `@td`/`{{VAR}}` tokens, no hardcodes |
| G6 Coverage (rec.) | PASS | 7/8 invariants mapped; PERM not xAPI-observable (documented) |
| G7 Duplication (rec.) | PASS | None |
| G8 Environment | PASS | Contract VERIFIED live; **0 BROKEN** (BLOCKED ≠ BROKEN) |
| G9 Sync | N/A | No existing cases |

## Remaining Items
### Must do before this suite can execute live
1. **Seed vcptcore-qa** (see data-prep below) + author 5 `SR_REP_*` aliases in `test-data/aliases.json` + add `STORE_ID_SECONDARY` to `.env.vcptcore`. Then run `/qa-seed-data` and re-verify the 29 BLOCKED cases.
2. **Register `050m`** in `config/test-suites.json` (block below) — deferred deliberately so it does not enter `graphql`/`backend` selections and fail CI while unseeded.

### Should do
3. Promote the 7 testable `PROPOSED-BL-SR-*` invariants into `knowledge/oracles/business-logic.md` after lead/oracle sign-off.
4. **README doc fix (team note, upstream):** `README.md` documents `salesRepCustomerOrderStatistics` — not implemented on the branch; and `salesRepCustomer` example uses `organizationId` where the real arg is `id`.
5. Consider a REST-layer case (`/api/sales-rep`, 049-series) for BL-SR-PERM (permission model isn't observable via xAPI).

## Files Modified
- **Added:** `regression/suites/Backend/graphql/050m-graphql-sales-rep.csv` (35 cases, Draft)
- No other files modified. `config/test-suites.json` intentionally NOT updated (see item 2).

## Recommended `config/test-suites.json` registration (when seeded)
```json
{
  "id": "050m",
  "name": "GraphQL Sales Rep (scoped /graphql/sales-rep)",
  "file": "regression/suites/Backend/graphql/050m-graphql-sales-rep.csv",
  "domain": "sales-rep", "layer": "backend", "concern": "api", "priority": "P1",
  "testCount": 35, "estimatedMinutes": 95, "agent": "qa-backend-expert",
  "tags": ["graphql","xapi","sales-rep","b2b","scoped-schema"],
  "requiresModules": ["sales-rep"], "customerApplicability": "reference"
}
```

## Data-prep note (vcptcore-qa only — for `/qa-seed-data`)
Accounts (each a Contact + login holding `sales-rep:access`):
- **SR_REP_PRIMARY** — store B2B; serves ACME, TECHFLOW, BUILDRIGHT, ACMEWEST; NOT SUSPENDED.
- **SR_REP_SECOND_STORE** — serves ACME but account bound to `STORE_ID_SECONDARY`.
- **SR_REP_BLOCKED** — serves ACME; account LockoutEnd set.
- **SR_REP_LOCKED** — serves TECHFLOW (active) + ACME (per-org membership locked in ACME only).
- **SR_REP_EXCLUSIVE_TECHFLOW** — serves ONLY TECHFLOW.

Orgs: ACME has an explicit Owner ≠ SR_REP_PRIMARY, a BusinessCategory, and a default address (City/Region); TECHFLOW has NO OwnerId.
Orders: ACME ≥2 orders on B2B store + ≥1 newer on `STORE_ID_SECONDARY` (store-scoped lastOrder), with line items (total>0, itemsCount>0); ≥1 order each on TECHFLOW/BUILDRIGHT/ACMEWEST (cross-customer dashboard); ACME orders spanning New/Cancelled/Failed/Processing (composite-status) + one Number with a distinctive keyword token.

## Next Steps
- [ ] Seed vcptcore-qa + author aliases/env var → re-run Phase 5 on the 29 BLOCKED cases
- [ ] Register `050m` in the manifest (block above)
- [ ] File the README doc-fix note on the PR (English)
- [ ] Promote `PROPOSED-BL-SR-*` after sign-off
