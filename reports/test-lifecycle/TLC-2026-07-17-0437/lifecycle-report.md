# Test Case Lifecycle Report — TLC-2026-07-17-0437

## Summary
- **Input:** VCST-5304 + VCST-5469 (one feature — BE + FE halves)
- **Input Type:** change-source (JIRA stories)
- **Date:** 2026-07-17 04:37
- **Feature:** Sales Rep hub — "My customers" list (`salesRepCustomers` scoped xAPI + `/company/my-customers` storefront)
- **Env:** vcptcore-qa (sales-rep module is vcptcore-only) · `vcptcore-qa.govirto.com` · storefront theme `2.54.0-pr-2383-f713` · module build `pr-2-6d2f`
- **Verdict:** **APPROVED WITH WARNINGS** — sync + schema-shape verification passed; value-level & FE-attribution checks deferred (BLOCKED on data, not a product defect). Touched/new cases stay `Draft`.

## Change Inventory
| Story | Layer | Change | Suite |
|-------|-------|--------|-------|
| VCST-5304 | xAPI (scoped `/graphql/sales-rep`) | `salesRepCustomers` returns rep's customer orgs + `lastOrder`; finalized contract 2026-07-16 | 050m |
| VCST-5469 | storefront (vc-frontend) | "Sales Rep hub" left-rail widget + `/company/my-customers` table/search/sort/paging/badge | 089 |

Two finalized clarifications on VCST-5304 (dev comments, 2026-07-16) drove the sync:
1. `lastOrder.total` is **nested Money** `{amount, formattedAmount, currency{code,symbol}}` (+ new `iconUrl`/`address{}` item fields).
2. **"Last order = My (current sales rep) last order"** — rep-attributed, not org-global.

## Phase Results
| Phase | Agent | Status | Key Metrics |
|-------|-------|--------|-------------|
| 1. Scope | orchestrator | Done | 2 suites (050m, 089); same-feature stories |
| 2. Sync | test-management-specialist | Done | 4 cases synced (SR-GQL-009/011/013, SR-FE-004) |
| 3. Analyze & Generate | test-management-specialist | Done | 2 cases added (SR-GQL-038 nested-total probe, SR-GQL-039 iconUrl/address on list) |
| 4. Review & Fix | test-management-specialist | Done | 0 new findings (all firing findings = pre-existing suite-wide GraphiQL-UI conventions, baseline-verified) |
| 5. Verify | qa-testing-expert | Partial | Flags 1–2 VERIFIED (schema); Flag 3 + all value-level BLOCKED (no populated rep) |
| 6. Approve | orchestrator | **APPROVED WITH WARNINGS** | 8/9 gates PASS; G8 partial |

## Sync Results
| Case | Classification | Action |
|------|----------------|--------|
| SR-GQL-009 | INCOMPLETE (total-shape) | Flagged (flat shape now stale vs live nested — see finding); query left pending value-level reverify |
| SR-GQL-011 | INCOMPLETE (attribution + total-shape) | Assertion rewritten to "most recent among orders the REP itself placed" (rejects other-actor/admin-seeded); total-shape flag added |
| SR-GQL-013 | INCOMPLETE (attribution) | Added rep-attribution assertion + cross-actor-leak failure signal; store-scoping preserved |
| SR-FE-004 | INCOMPLETE (attribution) | Added rep-attribution note + Cross_Layer_Checks cross-ref to SR-GQL-011 |

## New Cases
| Case | Suite | Title | Pri | Status |
|------|-------|-------|-----|--------|
| SR-GQL-038 | 050m | `salesRepCustomers — lastOrder.total Nested Money Shape` | High | Draft — **schema VERIFIED**, values pending |
| SR-GQL-039 | 050m | `salesRepCustomers — iconUrl + Full Address Block on LIST Items` | High | Draft — **schema VERIFIED**, values pending |

## Live Verification (Phase 5)
| Flag | Result | Evidence |
|------|--------|----------|
| 1 — `lastOrder.total` nested vs flat | **VERIFIED = nested** | Nested subfield selection validates + returns `data`, no `errors[]`. Flat scalar `total` would now fail validation. `sr-graphiql-argsurface-validates.png` |
| 2 — `iconUrl`+`address{}` on list items | **VERIFIED (schema)** | Both selectable on `salesRepCustomers` list items (not just singular) |
| 3 — my-last-order attribution + FE↔API | **BLOCKED** | Rep `belovedushka@gmail.com` now a plain customer (`totalCount:0`); `/company/my-customers` → redirect to dashboard. `sr-mycustomers-redirect-dashboard.png` |
| arg surface (first/after/keyword/sort/storeId/cultureName) | **VERIFIED** | `Unauthorized` (resolver stage), not "Unknown argument" |
| console/network on `/company/my-customers` | clean | `POST /graphql → 200`; no 4xx/5xx |

## Quality Gates
| Gate | Status | Details |
|------|--------|---------|
| G1 Structure | PASS | 15-col CSV, all rows parse |
| G2 Determinism | PASS | Only pre-existing suite-wide GraphiQL-UI conventions fire (baseline-verified vs untouched SR-GQL-001) |
| G3 Completeness | PASS | Touched cases have preconditions/assertions/failure-signals |
| G4 Testability | PASS | Falsifiable assertions |
| G5 Data Validity | PASS | `@td()` 124/124 (050m) + 15/15 (089) resolve; 0 hardcoded GUIDs |
| G6 Coverage | PASS (rec) | All cases carry PROPOSED-BL-SR-* refs |
| G7 Duplication | PASS (rec) | No same-layer dupes |
| G8 Environment | **PARTIAL** | Schema-shape flags VERIFIED; value-level + FE attribution BLOCKED (no data — not a defect) |
| G9 Sync | PASS | All STALE addressed (flagged + probes added) |

## Key Finding (feeds a follow-up)
**The deployed scoped schema now exposes the NESTED Money `total` shape.** SR-GQL-009/011 (and, in the profile/all-orders scope, SR-GQL-022/031) still select the FLAT `total currency itemsCount` that was schema-valid on 2026-07-15 but is contradicted by the 2026-07-16 build. Their flat selections would now FAIL validation live. They are flagged, not yet rewritten — a rewrite to the nested shape needs a **populated rep** to re-confirm value-level assertions in the same pass.

## Remaining Items
### Must Fix (before these cases leave Draft)
- Seed/assign a sales rep on vcptcore B2B-store with ≥1 served org holding a rep-flow order (`TEST_ENV=vcptcore npm run seed:sales-rep`, per `project_sales_rep_seeding`), then re-run Flags 1 & 3 for **value-level** confirmation + FE↔API match, and rewrite SR-GQL-009/011 flat `total` → nested Money.
- Confirm the VCST-5469 My-customers FE page is deployed on the target storefront build (redirect-to-dashboard was ambiguous: not-rep-enabled account vs page-not-in-build).

### Should Fix
- Consider aligning SR-GQL-022/031 (salesRepOrders, VCST-5308/all-orders scope) to nested `total` in a dedicated 5308 lifecycle pass — out of this ticket's scope.

## Files Modified
- `regression/suites/Backend/graphql/050m-graphql-sales-rep.csv` — SR-GQL-009/011/013 edited; SR-GQL-038/039 added
- `regression/suites/Frontend/sales-rep/089-sales-rep-my-customers-storefront.csv` — SR-FE-004 edited
- `config/test-suites.json` — 050m testCount 37 → 39
- (in-flight VCST-5308 work — SR-GQL-036/037, ORG_ACME address aliases — preserved untouched)

## Next Steps
- [ ] Seed a populated vcptcore rep → resolve value-level Flag 1/3 + FE test → promote SR-GQL-038/039 + rewrite SR-GQL-009/011 to nested total
- [ ] `/qa-regression sales-rep` on vcptcore once a populated rep exists
- [ ] Cases remain `Draft` until the above closes
