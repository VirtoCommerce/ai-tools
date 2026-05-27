# Test Case Lifecycle Report — TLC-2026-05-27-1700

## Summary
- **Input:** https://github.com/VirtoCommerce/vc-frontend/pull/2296 (PR #2296 — "feat(VCST-5100): loyalty catalog")
- **Input Type:** change-source (PR)
- **Date:** 2026-05-27 17:00
- **Platform:** 3.1030.0 · **Theme:** `vc-theme-b2b-vue-2.50.0-pr-2296-d7bf` (PR head sha d7bfc020, deployed) · **Loyalty:** 3.1002.0-pr-9-9fc4
- **Affected suite:** `Frontend/loyalty/083-loyalty-catalog` (regression-guard relevance to catalog 001-003 via no-leakage cases)
- **Verdict:** **APPROVED WITH WARNINGS**

## Phase Results

| Phase | Agent | Status | Key Metrics |
|-------|-------|--------|-------------|
| 1. Scope | orchestrator | Done | 1 suite (083); 30 files changed, all loyalty-catalog frontend |
| 2. Sync | test-management-specialist | Done | 18 cases assessed vs d7bf — **0 stale** (all VALID) |
| 3. Analyze & Generate | test-management-specialist | Done | 5 gaps confirmed → 5 cases generated (LOYF-019..023) |
| 4. Review & Fix | test-management-specialist | Done | 8 findings (B:0 C:0 H:0, rest Low/Med); 0 auto-fix needed |
| 5. Verify | qa-testing-expert (firefox) | Done | 5 new cases verified live; 2 CHANGED→corrected, 2 test-data-gapped (API verified) |
| 6. Approve | orchestrator | **APPROVED WITH WARNINGS** | Required gates 7/7 PASS; recommended 1 WARN |

## Change Inventory
| Area | Files | Signal |
|------|-------|--------|
| Loyalty page/composable | loyalty-catalog.vue, useLoyaltyCatalogCurrency.ts, useCatalogBasePath.ts | Currency context + namespaced base path |
| GraphQL queries | getProduct, getCategory, searchProducts, searchRelatedProducts, searchRecommendedProducts | currencyCode threading (PTS) |
| Router | constants.ts, main.ts, useCategoriesRoutes.ts | Namespaced /loyalty-catalog routes + deep-link |
| Components | product-card.vue, category(-selector).vue, top-header.vue | Namespaced links + nav entry point |
| Utilities | useBreadcrumbs.ts, useLanguages.ts, categories/product utils | Breadcrumb base path |

## Sync Results (Phase 2)
0 stale. All LOYF-001..018 VALID against d7bf. The PTS-assertion flips on LOYF-011/012/015 and the added LOYF-018 (done earlier today) confirmed correct/current — not re-flagged.

## New Cases Generated (Phase 3)
| Case ID | Title | Priority | Phase 5 Result |
|---------|-------|----------|----------------|
| LOYF-019 | Related products on loyalty PDP — currencyCode=PTS | High | API VERIFIED (`GetProductRecommendations` model=related-products → PTS); DOM `@needs-test-data` (no product has associations) |
| LOYF-020 | Recommended products on loyalty PDP — currencyCode=PTS | High | API VERIFIED (recommendations module **active**; related-products + bought-together → PTS); DOM `@needs-test-data` |
| LOYF-021 | Main-nav 'Loyalty' menu item → /loyalty-catalog | High | VERIFIED — entry point is the **Main-navigation "Loyalty" menu item** (NOT top-header); routes to /loyalty-catalog in PTS. CSV corrected. |
| LOYF-022 | Sidebar category links namespaced under /loyalty-catalog | High | VERIFIED — href `/loyalty-catalog/accessories`, sub-category grid in PTS |
| LOYF-023 | Breadcrumb links on loyalty PDP point back to /loyalty-catalog | High | CHANGED→corrected — only the root "Loyalty catalog" crumb is namespaced; category crumbs use un-namespaced backend seoPaths (assertion narrowed + noted) |

## Coverage Delta
| Metric | Before | After |
|--------|--------|-------|
| Total cases (083) | 18 | 23 (+5) |
| PDP related/recommended currency coverage | 0 | 2 |
| Navigation (nav entry / sidebar / breadcrumb) coverage | partial | 3 dedicated cases |

## Context7 Findings
`recommendations` query (models related-products / bought-together) accepts `currencyCode` — confirmed the PR's searchRelated/RecommendedProducts changes thread PTS. Verified live: `GetProductRecommendations` sends `currencyCode=PTS` on a loyalty PDP.

## Quality Gates
| Gate | Status | Details |
|------|--------|---------|
| G1 Structure | PASS | 23 rows, 15 cols, IDs unique/sequential, quotes balanced |
| G2 Determinism | PASS | LOYF-021 vague locator resolved via Phase 5 (real label "Loyalty" menu item) |
| G3 Completeness | PASS | 0 High findings |
| G4 Testability | PASS | 0 critical |
| G5 Data Validity | PASS | 48/48 `@td()` resolved; no hardcoded IDs/prices/URLs |
| G6 Coverage | **WARN** | Loyalty domain has no `BL-LOYALTY-*` invariants; ECL-3.1/7.1 used. Recommend drafting BL-LOYALTY-* (route guard, currency continuity). |
| G7 Duplication | PASS | LOYF-011/019/022 overlaps are distinct seams (product-card vs related-widget vs sidebar) |
| G8 Environment | PASS | 0 BROKEN; CHANGED items (021/023) corrected in CSV |
| G9 Sync | PASS | 0 stale; nothing broken |

## Remaining Items
### Should Fix (improves quality)
| Case | Item | Note |
|------|------|------|
| LOYF-019/020 | DOM-render is `@needs-test-data` | Seed a loyalty product WITH associations + a product whose recommendation engine returns items, so the rendered-cards-in-PTS path is exercised (API contract already verified). |
| Domain | No BL-LOYALTY-* invariants | Draft route-guard + currency-continuity invariants (run with `--update-bl` or propose manually). |

### Out of Scope (separate stories — not covered, by design)
- Loyalty **cart** pricing (item lands in USD).
- **Search** within loyalty-catalog ("TBD Search in loyalty-catalog").

## Files Modified
- `regression/suites/Frontend/loyalty/083-loyalty-catalog.csv` — +5 cases (LOYF-019..023); LOYF-021/023 corrected to live behavior; LOYF-019/020 made API-primary with `@needs-test-data` DOM.
- `config/test-suites.json` — suite 083 testCount 17→23, estimatedMinutes 20→28.

## Next Steps
- [ ] (Optional) Seed associations/recommendations test data to lift LOYF-019/020 DOM assertions off `@needs-test-data`.
- [ ] (Optional) Draft `BL-LOYALTY-*` invariants for route guard + currency continuity.
- [ ] Suite 083 is regression-eligible — run `/qa-regression` (loyalty) when promoting Draft→Reviewed.
