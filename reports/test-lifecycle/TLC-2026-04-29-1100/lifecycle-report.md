# Test Case Lifecycle Report — TLC-2026-04-29-1100

## Summary

- **Input:** `review 050k`
- **Input Type:** direct-scope (suite review)
- **Date:** 2026-04-29 10:00 UTC+2
- **Platform:** 3.1025.0 (vcst-qa)
- **Theme:** not relevant — backend GraphQL suite
- **Module Versions (relevant to scope):**
  - VirtoCommerce.XPickup: **3.1001.0-pr-8-3380** (vc-module-x-pickup PR #8 — VCST-4707 IncludeLocationIds fix is deployed)
  - VirtoCommerce.XCart: 3.1010.0
  - VirtoCommerce.XCatalog: 3.1005.0
  - VirtoCommerce.Xapi: 3.1006.0
  - VirtoCommerce.Inventory: 3.1001.0
- **Verdict:** **NEEDS FIXES**

## Phase Results

| Phase | Agent | Status | Key Metrics |
|-------|-------|--------|-------------|
| 1. Scope | orchestrator | Done | 1 suite (050k), 6 cases, layer=graphql/api |
| 2. Sync | — | Skipped (direct scope) | — |
| 3. Analyze & Generate | test-management-specialist | Done (analyze only) | 4 gaps identified, 0 cases generated (advisory) |
| 4. Review & Fix | test-management-specialist | Done | 9 findings (Critical: 1, High: 3, Medium: 4, Low: 1) |
| 5. Verify | — | Skipped (no UI — GraphQL/API suite) | — |
| 6. Approve | orchestrator | **NEEDS FIXES** | Gates: 5/8 passed (G6, G7, G8 advisory) |

## Quality Gates

| Gate | Status | Details |
|------|--------|---------|
| G1: Structure | PASS | 6 cases, IDs unique, format valid, lint passes |
| G2: Determinism | PASS | All steps tagged (GQL-OP / GQL-EXEC / GQL-CAPTURE / AUTH) |
| G3: Completeness | WARN | 4 cases missing `[ERRORS label=cleanup_clear]` (Low — best-effort cleanup convention OK) and missing `STORE_ID` token in Test_Data column (Medium) |
| G4: Testability | PASS | All assertions falsifiable; runner-manual EVIDENCE entries documented |
| G5: Data Validity | **FAIL** | Critical: GQL-094 missing `price: 0` on `addOrUpdateCartShipment` for pickup shipment (BL-BOPIS-002 — pickup shipping cost MUST be $0). High: 5 cases stamped `Automation_Status: Automated` but never peer-reviewed (must be `Draft`). |
| G6: Coverage | **FAIL** | Critical: All 6 cases reference `BL-BOPIS-007` (storefront map UI invariant) — wrong invariant for API-layer pickup queries. Correct mappings exist in business-logic.md. GQL-094 References still says `BL-BOPIS-008-PROPOSED` — invariant was promoted 2026-04-28. |
| G7: Duplication | PASS | No xCart-API-layer duplicates with 050b1–b4 or BOPIS frontend suites |
| G8: Environment | SKIPPED | Phase 5 not run (GraphQL/API only) |
| G9: Sync | N/A | Direct-scope review, no sync phase |

## Findings by Dimension

### Must Fix (blocks regression)

| # | Severity | Cases | Dimension | Issue | Suggested Fix |
|---|----------|-------|-----------|-------|---------------|
| **F-1** | Critical | All 6 (GQL-094, 127, 128, 129, 130, 131) | BL/ECL Coverage | `Business_Rule` references `BL-BOPIS-007`, which is the *storefront map-collapse-on-no-results* UI invariant — not relevant to API-layer pickup queries. Verified against `business-logic.md` line 585. | Re-map per query target: GQL-094/129/130/131 → `BL-BOPIS-008` (cartPickupLocations confirmed-prepend); GQL-127 → `BL-BOPIS-005` (inactive locations excluded); GQL-128 → `BL-BOPIS-003` (FFC availability label matches stock). Also drop the `-PROPOSED` suffix on GQL-094 (BL-BOPIS-008 was promoted 2026-04-28 — confirmed in `business-logic.md` line 598). |
| **F-2** | High | GQL-094 | Data Validity (DV-010) | `addOrUpdateCartShipment.shipment` for pickup omits `price: 0`. CartShipmentValidator may reject without a price match — and BL-BOPIS-002 (`P0-revenue`) mandates `$0` shipping cost for pickup. | Add `price: 0` inside the `shipment: { ... }` block: `shipment: { pickupLocationId: "{{LAST_LOCATION_ID}}" price: 0 }`. |
| **F-3** | High | GQL-127, GQL-128, GQL-131 | BL/ECL Coverage (REQ-001) | High-priority cases missing JIRA reference in `References` column. | GQL-127 → add `VCST-4707`; GQL-128 → add `VCST-4618`; GQL-131 → add `VCST-4618` (filter narrowing was a regression scope in that ticket). |
| **F-4** | High | GQL-127, 128, 129, 130, 131 | Structure (S-006) | `Automation_Status = Automated` on 5 unreviewed cases. Workflow rule: only `qa-lead-orchestrator` approval can promote past `Draft`. | Reset all 5 to `Draft`. |

### Should Fix (improves quality)

| # | Severity | Cases | Dimension | Issue | Suggested Fix |
|---|----------|-------|-----------|-------|---------------|
| F-5 | Medium | GQL-129, GQL-131 | BL/ECL Coverage | `ECL-9.1` (Fake & Manipulated Reviews) is inapplicable to pickup filter/search. | Replace with `ECL-14.1` (GraphQL xAPI Error Patterns) or remove the `ECL-9.1` token. Keep `ECL-14.2` (Search Index Lag) — pickup locations are ES-indexed per VCST-4650, so the ref is defensible. |
| F-6 | Medium | GQL-094, 129, 130, 131 | Completeness (C-002) | `Test_Data` column omits `STORE_ID` env var binding (other suites uniformly declare it). | Add `store_id={{STORE_ID}}` to `Test_Data`. |
| F-7 | Medium | GQL-094 | Data Validity (DV-012) | `probe_all_locations` uses thin field selection (`items { id name }`) without an inline note explaining its role. The minimal selection is justified (counter probe / capture-only) but should be self-documenting. | Add a one-line note in Preconditions or as a `# capture probe` comment line so reviewers don't flag it. |
| F-8 | Medium | GQL-094 | Data Validity (DV-009) | `ShipmentType.pickupLocation { id }` is referenced in `set_shipment_pickup` response selection. `ShipmentType` sub-fields are not enumerated in `graphql-schema.md` — needs live introspection confirmation. | Run `npm run schema:refresh` and confirm `ShipmentType.pickupLocation` is a valid selection before first regression run. |
| F-9 | Low | GQL-094, 129, 130, 131 | Completeness (C-005) | `cleanup_clear` mutations have no `[ERRORS]` assertion. Acceptable per convention (best-effort cleanup; next test's `pre_clear` catches stale state). | No action — convention. |

## Coverage Gaps (Phase 3 — Recommended Additions)

| Proposed ID | Title | Priority | Rationale |
|---|---|---|---|
| GQL-132 | `cartPickupLocations` with empty cart returns valid response (no error) | P1 | VCST-4618 archive TC-BE-008 — degenerate GroupBy filter case. Not covered. |
| GQL-133 | `cartPickupLocations` with two configurable variants sharing ProductId deduplicates correctly (VCST-4618 regression) | P1 | Core VCST-4618 bug (ToDictionary "same key" exception). No runner-native regression case in 050k. |
| GQL-134 | Cursor pagination — confirmed location not re-prepended on page 2 | P2 | `after` cursor never exercised. IncludeLocationIds prepend-once semantic across pages unverified. |
| GQL-135 | `productPickupLocations` keyword narrows result set | P2 | Parity with GQL-129 keyword coverage on cartPickupLocations. |

These are advisory. Author after must-fix items are addressed.

## Manual Items (no auto-fix possible)

- M-1: GQL-129 case-insensitive keyword assertion is runner-manual EVIDENCE — CSV captures cannot transform string case. OK as documented.
- M-2: GQL-130 per-facet presence (all 3 requested facets returned) is EVIDENCE-only. OK.
- M-3: GQL-094 `ShipmentType.pickupLocation { id }` confirmation requires schema introspection (see F-8).
- M-4: GQL-127 `[AUTH role=ORG_USER]` on PUBLIC endpoint is suite-convention; no anonymous variant exists. Note only.

## Files Reviewed

- `regression/suites/Backend/graphql/050k-graphql-xpickup.csv` — 6 cases (GQL-094, 127, 128, 129, 130, 131)

## Files Modified by This Run

- None. All findings are advisory; user is actively editing this file (recent intentional change to GQL-094 added `@td(BUYABLE_NO_MIN_QTY.id)` alias to fix BUG-050b1-003 silent addItem rejection from REG-2026-04-29-0929 — preserved as-is).

## Build Verification

- `vc-deploy-dev/backend/packages.json` (branch `vcst-qa`): platform `3.1025.0`, XPickup PR #8 deployed → VCST-4707 fix is testable end-to-end.
- Manifest lint (`npx tsx scripts/sync-test-suites.ts --check`): **OK** (95 suites, 33 selections).

## Next Steps

- [ ] **Apply F-1 (Critical):** Re-map `Business_Rule` in all 6 cases per the suggested mapping. Drop `-PROPOSED` suffix on GQL-094.
- [ ] **Apply F-2 (High):** Add `price: 0` to GQL-094 `set_shipment_pickup` shipment block.
- [ ] **Apply F-3 (High):** Add JIRA references to GQL-127/128/131.
- [ ] **Apply F-4 (High):** Reset GQL-127/128/129/130/131 `Automation_Status` to `Draft`.
- [ ] Apply Should Fix items (F-5, F-6, F-7, F-8) opportunistically.
- [ ] Run `npm run schema:refresh` to confirm `ShipmentType.pickupLocation` field selection (F-8).
- [ ] Author GQL-132 + GQL-133 (P1 gaps) before promoting suite to regression-eligible state for VCST-4618/VCST-4707 scope.
- [ ] Re-run `/qa-test-lifecycle suite 050k --skip-verify --skip-sync` after fixes applied to confirm gates pass.
- [ ] Then run `/qa-regression 050k` to validate against the live PR #8 build.
