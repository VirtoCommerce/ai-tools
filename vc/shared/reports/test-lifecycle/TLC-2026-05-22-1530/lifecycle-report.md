# Test Case Lifecycle Report — TLC-2026-05-22-1530

## Summary
- **Input:** `004,005`
- **Input Type:** direct-scope
- **Date:** 2026-05-22
- **Platform:** 3.1028.0 (vcst-qa)
- **Theme:** 2.50.0-pr-2291 (`vc-theme-b2b-vue-2.50.0-pr-2291-fed4-fed4fe16`)
- **Relevant modules:** XCatalog 3.1005.0 · XFrontend 3.1000.0 · Search 3.1001.0 · ElasticSearch 3.806.0 · ElasticSearch8 3.1003.0 · Catalog 3.1022.0
- **Verdict:** **APPROVED WITH WARNINGS**

## Phase Results

| Phase | Agent | Status | Key Metrics |
|-------|-------|--------|-------------|
| 1. Scope | orchestrator | Done | 2 suites (004, 005), 60 cases, direct-scope |
| 2. Sync | — | Skipped | direct-scope (no change inventory) |
| 3. Analyze & Generate | test-management-specialist | Done | 5 gaps surfaced, 2 cases generated |
| 4. Review & Fix | test-management-specialist | Done | 3 Blockers + 2 Highs auto-fixed; 6 Should-Fix items remain |
| 5. Verify | qa-testing-expert (firefox) | Done | 6 P0 targets verified, 0 broken |
| 6. Approve | orchestrator | **APPROVED WITH WARNINGS** | 7/9 gates PASS, 2 WARN |

## Coverage Delta

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| Suite 004 cases | 27 | 28 | +1 |
| Suite 005 cases | 33 | 34 | +1 |
| Total cases | 60 | 62 | +2 |
| Structural blockers | 4 | 0 | -4 |

## New Cases Generated

| Case ID | Suite | Title | Layer | Priority | Gap |
|---------|-------|-------|-------|----------|-----|
| SRCH-NEW-056 | 004 | No-Results Suggestion Link Is Clickable and Navigates to Corrected Results | frontend | Medium | GAP-S-03 (BL-SRCH-002 suggestion link isolation) |
| SRCH-NEW-103 | 005 | Facet Count Accuracy on Search Results Page Matches Displayed Product Count | frontend | High | GAP-S-01 (BL-SRCH-001 on `/search?q=`) |

## Auto-Fixes Applied (5)

| Suite | Case ID | Fix | Dimension |
|-------|---------|-----|-----------|
| 004 | SRCH-NEW-003 | Preconditions CSV cell de-split + `Automation_Status=Manual` | S-007 / S-006 |
| 005 | SRCH-NEW-043 | Preconditions CSV cell de-split + `Automation_Status=Manual` | S-007 / S-006 |
| 005 | SRCH-NEW-044 → SRCH-NEW-100 | ID-collision rename (existed in both 004 + 005) | S-003 |
| 005 | SRCH-NEW-045 → SRCH-NEW-101 | ID-collision rename + internal `SRCH-NEW-044` ref updated | S-003 |
| 005 | SRCH-NEW-046 → SRCH-NEW-102 | ID-collision rename | S-003 |

## Quality Gates

| Gate | Status | Details |
|------|--------|---------|
| G1 Structure | PASS | 0 Blocker findings remaining (3 auto-fixed) |
| G2 Determinism | PASS | 0 Critical findings |
| G3 Completeness | PASS | 0 High findings |
| G4 Testability | PASS | 0 Critical (3 Highs flagged as DV-016 — env-fragile literals) |
| G5 Data Validity | PASS | 0 Critical/Blocker (no hardcoded URLs/creds/GUIDs) |
| G6 BL/ECL Coverage | **WARN** | ~55 cases use `BL-SEARCH-*` vs canonical `BL-SRCH-*` (per `business-logic.md` Domain 9) |
| G7 Duplication | **WARN** | DUP-002: mobile cases overlap across 004/005; cross-browser cases in 005 belong in 048 |
| G8 Environment | PASS | 6/6 P0 targets VERIFIED on vcst-qa Firefox |
| G9 Sync | SKIP | No sync phase (direct-scope) |

## Environment Verification (Phase 5)

| Case ID | URL | Result | Evidence |
|---------|-----|--------|----------|
| SRCH-NEW-001 | `/` (search dropdown) | VERIFIED | Dropdown opens; `Check all products` → `/catalog`; 0 console errors |
| SRCH-NEW-002 | `/` + type "hoodie" | VERIFIED | 2 product hits + thumbnails + prices + clear button |
| SRCH-NEW-007 | `/search?q=hoodie` | VERIFIED | URL correct; H1 "returned the following 2 results"; grid + sidebar |
| SRCH-NEW-016 | `/search?q=xyzqwerty…` | VERIFIED | No-results UI; "Reset search" button; no products/sidebar |
| SRCH-NEW-020 | XSS payload as `q=` | VERIFIED | Literal text in `<strong>`; no alert; no script execution |
| SRCH-NEW-100 | `/catalog` (facet panel) | VERIFIED | 17 facet panels render; 3,604 results |

**Env health:** FRONT_URL reachable; no login wall; Theme 2.50.0-pr-2291 confirmed deployed; no blocking network failures.

## Remaining Items (Should-Fix — not blocking regression)

### MANUAL-01 — BL prefix normalization (~55 cases)
Replace `BL-SEARCH-001..005` with canonical `BL-SRCH-001..005`. Mass search/replace across both CSVs. Source: `.claude/agents/knowledge/business-logic.md` Domain 9.

### MANUAL-02 — `@td(SEARCH_HOODIE_PRODUCT)` alias
4 cases (SRCH-NEW-005, 035, 040, 042) hardcode "Vintage Colorado Hoodie" + `$54.00`. Per `[feedback_env_resilience.md]` + `[feedback_flexible_test_cases.md]`. Phase 5 also observed the live price is `$20.00`, not `$54.00` — the assertions are already stale.

### MANUAL-03 — Mobile case overlap
SRCH-NEW-031/032 (005) ≈ SRCH-NEW-052/055 (004). Suite 004 versions are `Reviewed` and more comprehensive. Recommend scoping 005's mobile cases to filter-panel-only.

### MANUAL-04 — Cross-browser cases in wrong suite
SRCH-NEW-029/030 (005, Firefox/Edge) belong in `048-browser-compatibility.csv`.

### MANUAL-05 — Generated cases lack VCST ticket
~40 generated cases use only `E2E-*`/`GAP-*` refs. Create coverage tracker ticket or accept `smoke-baseline` placeholder.

### MANUAL-06 — BL-SRCH-004 coverage gap
No case tests cross-store search isolation. Defer to a new suite (E2E scope).

### Phase 5 observation
SRCH-NEW-001 Hints section requires seeded search history — preconditions need explicit seeding or conditional language. SRCH-NEW-100 originally referenced a stale homepage-footer category URL that returns 0 results; pin to `@td(VIRTUAL_CATALOG_B2B.id)`-rooted `/catalog` or a known-populated subcategory.

## Files Modified
- `regression/suites/Frontend/search/004-search-core.csv` — SRCH-NEW-003 fixed + SRCH-NEW-056 appended (28 cases)
- `regression/suites/Frontend/search/005-search-filters-advanced.csv` — SRCH-NEW-043 fixed + renumbered SRCH-NEW-044/045/046 → SRCH-NEW-100/101/102 + SRCH-NEW-103 appended (34 cases)

**testCount in `config/test-suites.json` needs update:** suite 004 27→28, suite 005 33→34.

## Next Steps
- [ ] Run `/qa-regression search` once MANUAL-02 alias is created (the hardcoded `$54.00` will fail Phase 5 today — live price is `$20.00`)
- [ ] Bulk apply MANUAL-01 (BL-SEARCH → BL-SRCH) before next test review
- [ ] Update `config/test-suites.json` testCount for 004 and 005
- [ ] Decide on MANUAL-03/04 (mobile dedup, cross-browser case move)
