# Test Case Lifecycle Report — TLC-2026-07-17-0420

## Summary
- **Input:** [VCST-5308](https://virtocommerce.atlassian.net/browse/VCST-5308) — *[BFE] [Sales Rep] View customer profile* (Story, status **Testing**)
- **Input Type:** change-source (JIRA Story + live dev GraphQL contract)
- **Date:** 2026-07-17 04:20
- **Env / Build:** vcptcore-qa @ sales-rep xAPI **pr-2** · Theme **vc-theme-b2b-vue 2.54.0-pr-2383** (only env with `VirtoCommerce.SalesRep`)
- **Verdict:** **APPROVED WITH WARNINGS** — all required gates pass; the storefront profile page + its 3 sections + the full xAPI contract were live-verified, and a real schema drift was caught and corrected. New/changed cases remain **Draft** pending orchestrator promotion + a small residual live-confirm (see Must/Should Fix).

## Phase Results

| Phase | Agent | Status | Key Metrics |
|-------|-------|--------|-------------|
| 1. Scope | orchestrator | Done | 3 suites in domain; gap = customer profile (storefront) + profile-field selections (xAPI) |
| 2. Sync | test-management-specialist | Done | 089 SR-FE-023 resolved (VCST-5304 reorg decided); 050m arg/`total` drift synced to live contract (24 cases) |
| 3. Analyze & Generate | test-management-specialist | Done | New suite **091** (20 cases); 050m enriched SR-GQL-036/037 (+ probe 038/039) |
| 4. Review & Fix | test-management-specialist | Done | 091: 39 findings → 32 auto-fixed, 7 Medium reviewed no-change; td-refs green |
| 5. Verify | qa-testing-expert | Done | 3/3 contract flags resolved (1 CHANGED); route + 3 sections **VERIFIED**; console clean |
| 5b. Apply CHANGED | test-management-specialist | Done | 24 cases corrected to live contract; self-caught + fixed 5 hardcoded GUIDs |
| 6. Approve | orchestrator | **APPROVED W/ WARNINGS** | Required gates 7/7; recommended 2 WARN |

## Change Inventory
| Area | Layer | In scope (VCST-5308) | Excluded (other tickets) |
|------|-------|----------------------|--------------------------|
| Customer profile page | storefront | Customer-info block · Orders (recent-first, status filter, localized) · Sales-widgets **container** | Widget detail (VCST-5309) · Top products (VCST-5368) · Drag&drop (VCST-5367) · GA insights (VCST-5337) · Quick actions |
| `salesRepCustomer` / `salesRepOrders` / `salesRepOrderStatuses` | xAPI (scoped `/graphql/sales-rep`) | profile-field selections (iconUrl, address, nested `total`) | — |

## Live Verification — schema drift caught (Phase 5)
Live introspection on today's build (pr-2 / pr-2383) resolved all three flags; two had **drifted** from what 050m encoded on 2026-07-16 (pr-2380):

| Item | 050m before | **Live-confirmed (2026-07-17)** | Verdict |
|------|-------------|----------------------------------|---------|
| `salesRepCustomer` arg | `id:` | **`organizationId:` (String!)**; return fields `organizationId`/`organizationName` (no `id`/`name`) | CHANGED → fixed |
| `salesRepOrders` arg | `customerId:` | **`organizationId:`** | CHANGED → fixed |
| `total` shape | flat scalar | **nested `MoneyType` `{amount formattedAmount currency{code symbol}}`** | CHANGED → fixed |
| profile route | `{HYPOTHESIS}` | **`/company/my-customers/{organizationId}`** | VERIFIED |
| Customer-info / Orders / Widgets sections | — | all render; `/graphql` 12×200; **console 0 errors** | VERIFIED |

Query confirmed live (ORG_ACME `@td(ORG_ACME.id)`): `salesRepOrders` → `CO260716-00001`, status `New`, `total.formattedAmount "$133.20"`, `currency{USD,$}`. `salesRepOrderStatuses` → `[Cancelled, Completed, New, Pending, Processing]` with `localizedName`.

## Coverage Delta
| Metric | Before | After | Δ |
|--------|--------|-------|---|
| sales-rep storefront suites | 089, 090 | 089, 090, **091** | +1 suite |
| 091 cases (customer profile) | 0 | 20 (SR-CP-001..020) | +20 |
| 050m cases | 35 | 39 | +4 (036/037 profile fields, 038/039 probes) |
| xAPI profile-field coverage (iconUrl/address/nested total) | none | asserted | closed |

## Quality Gates
| Gate | Status | Details |
|------|--------|---------|
| G1 Structure | **PASS** | 0 blocker; CSV valid, IDs unique, manifest synced |
| G2 Determinism | **PASS** | 091: 2 Medium mid-flow asserts (legit gates, reviewed). 050m legacy-GraphiQL-format baseline noise is **pre-existing, suite-wide** — not introduced here |
| G3 Completeness | **PASS** | all cases ≥2 assertions + ≥2 failure signals after auto-fix |
| G4 Testability | **PASS** | vague/`{HYPOTHESIS}` predicates removed; route now `{OBSERVED}` |
| G5 Data Validity | **PASS** | td-refs green (050m 129/129, 089 15/15, 091 39/39); every query live-schema-validated |
| G6 BL Coverage | **WARN** | 091/050m cite `PROPOSED-BL-SR-*` — invariants not yet finalized in business-logic.md |
| G7 Duplication | **WARN** | 5 DUP Medium = minimal 3-line standalone-setup overlap (089/090 precedent) — accepted |
| G8 Environment | **PASS** | route + 3 sections VERIFIED; the 3 CHANGED flags corrected; 0 BROKEN |
| G9 Sync | **PASS** | SR-FE-023 resolved; 050m drift synced to live contract |

## Must Fix (before promoting 091/050m to regression-eligible)
| Item | Detail |
|------|--------|
| Residual arg/field not re-introspected | `salesRepOrders.items.customerId/customerName` field names and the **plural** `salesRepCustomers` arg were NOT separately introspected in Phase 5 — flagged in-case. Close with a ~2-query GraphiQL mini-verify before promotion. |
| Promotion sign-off | All 59 touched cases (050m 39 + 091 20) are `Automation_Status: Draft`. Orchestrator/lead must promote → Reviewed after the mini-verify above. |

## Should Fix (quality)
- **Pagination boundary** (Orders `first:20`): no fixture org has >20 orders — TC-001 boundary case deliberately not authored (data gap). Seed a high-order-count org to cover.
- **050m legacy format**: 39 cases use the legacy GraphiQL-UI step format (pre-existing tech debt) — a whole-suite migration to runner-native GraphQL is a separate initiative.
- **SR-GQL-038** now superseded by SR-GQL-011 (its flat-vs-nested question is answered) — fold in on a future consolidation pass.

## Observations (out of scope — not acted on)
- **Sales-widget KPI values are mock**, not API-backed: `salesRepCustomerOrderStatistics` is absent from the scoped schema, so the 4 KPI widgets show demo figures that don't reconcile with real orders. Expected for this build; value-reconciliation belongs to **VCST-5309**. SR-CP-015 asserts container-render only + carries this note.
- **Unregistered suite `regression/suites/Backend/sales-rep/092-sales-rep-admin.csv`** (30 cases, td-refs green) exists on disk but is **not** in `config/test-suites.json` — surfaced by the specialist; registering it is a separate task (not VCST-5308).

## Files Modified
- `config/test-suites.json` — registered suite 091; 050m testCount 35→39; synced selection groups
- `regression/suites/Backend/graphql/050m-graphql-sales-rep.csv` — arg/`total` drift sync + SR-GQL-036/037 enrich
- `regression/suites/Frontend/sales-rep/091-sales-rep-customer-profile-storefront.csv` — **new** (20 cases)
- `regression/suites/Frontend/sales-rep/089-sales-rep-my-customers-storefront.csv` — SR-FE-023 sync
- `test-data/aliases.json` — ORG_ACME address fields exposed via `@td()`

## Next Steps
- [ ] Mini-verify the 2 residual flags (plural `salesRepCustomers` arg + `salesRepOrders.items.customerId/customerName`), then promote 050m/091 Draft → Reviewed
- [ ] `/qa-regression sales-rep` (or `091,050m`) against **vcptcore-qa** once promoted
- [ ] Register/scope suite 092 (separate task); finalize `PROPOSED-BL-SR-*` invariants
