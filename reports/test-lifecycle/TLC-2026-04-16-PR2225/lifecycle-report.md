# Test Case Lifecycle Report — TLC-2026-04-16-PR2225

## Summary
- **Input:** PR #2225 (VirtoCommerce/vc-frontend) — feat(VCST-4713): conditional sections in product configuration
- **Input Type:** change-source (feature PR)
- **Date:** 2026-04-16
- **Platform:** 3.1019.0
- **Theme:** 2.46.0-pr-2225-572f-572f0087
- **Module Versions:** Catalog 3.1018.0-pr-871-3340, XCart 3.1007.0-pr-105-3ec5, XCatalog 3.1004.0
- **Verdict:** NEEDS FIXES (7 High findings — all auto-fixable)

## Phase Results

| Phase | Agent | Status | Key Metrics |
|-------|-------|--------|-------------|
| 1. Scope | orchestrator | Done | 6 suites affected (072, 072b, 072c, 052 must-run; 028-030, 050 should-run) |
| 2. Sync | test-management-specialist | Done | 48 COND cases: 35 VALID, 8 STALE, 5 INCOMPLETE |
| 3. Analyze | test-management-specialist | Done | 5 gaps found, 4 new cases recommended |
| 4. Review | test-management-specialist | Done | 16 findings (0B, 0C, 7H, 6M, 3L) |
| 5. Verify | — | Done (via VCST-4713 verification run) | 34 tests, 32 PASS, 1 FAIL (design ambiguity), 4 BLOCKED |
| 6. Approve | orchestrator | **NEEDS FIXES** | Gates: 7/9 PASS, 2 FAIL (G3, G9) |

## Change Inventory

| File | Layer | Changes | Impact |
|------|-------|---------|--------|
| `getProductConfigurationsQuery.graphql` | GraphQL | +1 | Added `dependsOnSectionId` field |
| `types.ts` | TypeScript | +3/-1 | Added type definition |
| `add-to-cart.vue` | Cart UI | +10/-1 | `configurableDisabled` computed |
| `product-configuration.vue` | Config UI | +111/-109 | `v-if="isSectionVisible()"` |
| `useConfigurableProduct.ts` | Core logic | +80/-1 | `hiddenSectionIds`, `clearHiddenSectionValues()`, `isRequiredConfigurationComplete` |

## Sync Results (Phase 2)

| Classification | Count | Cases |
|---------------|-------|-------|
| VALID | 35 | No change needed |
| STALE | 8 | CFG-PDP-037/038/040-COND (None semantics), CFG-CA-019/020/022/023 (admin label), CFG-PDP-026/035-COND |
| INCOMPLETE | 5 | CFG-PDP-033/039-COND, CFG-E2E-067/070-COND, CFG-CROSS-002-COND (missing seed products) |
| BROKEN | 0 | — |

## Coverage Gaps (Phase 3)

| Gap ID | Priority | New Case | Coverage |
|--------|----------|----------|----------|
| GAP-4713-001 | High | CFG-PDP-042-COND | "None" product option visibility characterization |
| GAP-4713-002 | High | CFG-PDP-043-COND | `configLoading` interim disable during widget load |
| GAP-4713-003 | Medium | CFG-PDP-044-COND | `updateWithDefaultValues()` skips hidden sections |
| GAP-4713-005 | Medium | CFG-PDP-045-COND | `hiddenSectionIds` max-iterations guard (circular dep) |

Cart suites 028-030: NOT impacted (`configurableDisabled` scoped to configurable product PDP only).

## Quality Gates

| Gate | Status | Details |
|------|--------|---------|
| G1: Structure | PASS | 0 Blockers |
| G2: Determinism | PASS | 0 Critical |
| G3: Completeness | **FAIL** | 7 High findings (must fix before regression) |
| G4: Testability | PASS | 0 Critical |
| G5: Data Validity | PASS | 0 Critical/Blocker |
| G6: Coverage | PASS | BL-CAT-006 + BL-PRICE-001 covered, 4 new cases fill remaining gaps |
| G7: Duplication | PASS | No same-layer duplicates |
| G8: Environment | PASS | Verified via VCST-4713 run (32/34 PASS) |
| G9: Sync | **FAIL** | 8 STALE cases identified, not yet fixed |

## Must Fix (blocks regression run)

| # | Case ID | Issue | Fix |
|---|---------|-------|-----|
| 1 | CFG-CA-019/020/022/023 | Admin label "Depends On" → "Active when section has value" | Text replacement in 052 CSV |
| 2 | CFG-CA-023 | Assertions expect validation error, actual is silent reject | Update assertions to OPTION 3 |
| 3 | CFG-PDP-037/040-COND | Assertions expect None to hide sections, it doesn't | Update to document actual behavior |
| 4 | CFG-PDP-026-COND | "Installation" → "Tire Type" in Cross_Layer_Checks | Text replacement |
| 5 | CFG-PDP-035-COND | Missing `configurableDisabled`/`isRequiredConfigurationComplete` assertion | Add assertion |
| 6 | CFG-E2E-063-COND | `{{USER_ID}}` needs dynamic resolution note | Add to Preconditions |
| 7 | New cases 042-045-COND | 4 new test cases for uncovered PR functions | Append to 072 CSV |

## Should Fix (improves quality)

| # | Case ID | Issue | Fix |
|---|---------|-------|-----|
| 1 | CFG-PDP-033/E2E-067/CROSS-002 | Missing seed product prerequisite note | Add to Preconditions |
| 2 | CFG-PDP-027-COND | Design note in Steps → move to Preconditions | Move text |
| 3 | CFG-PDP-026-COND | Title says "Required" but section is optional | Update title |
| 4 | CFG-PDP-034-COND | Missing network mutation negative assertion | Add to Cross_Layer_Checks |

## Environment Verification (Phase 5 — via VCST-4713 run)

| Agent | Browser | Tests | Passed | Key Finding |
|-------|---------|-------|--------|-------------|
| qa-frontend-expert | chrome→firefox | 15 | 15 | All core flows verified |
| qa-backend-expert | edge | 10 | 8 | Admin UI + GraphQL verified, 1 blocked |
| qa-testing-expert | firefox | 15 | 9 | Extended PDP + cross-cutting, 1 FAIL (None semantics) |
| **Total** | | **40** | **32** | **1 FAIL, 4 BLOCKED, 2 SKIP** |

## Next Steps
- [ ] Confirm and apply 7 Must Fix changes to CSV files
- [ ] Generate 4 new test cases (CFG-PDP-042 through 045-COND)
- [ ] Seed CFG-026 and CFG-029 products in QA environment
- [ ] Re-run quality gate after fixes → expected verdict: APPROVED
- [ ] Run `/qa-regression configurable-products` with fixed suites
- [ ] Clarify "None" product option semantics with product team (FINDING-1)
