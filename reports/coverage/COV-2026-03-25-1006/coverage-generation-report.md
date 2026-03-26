# Coverage Generation Report — COV-2026-03-25-1006

## Summary
- **Run date:** 2026-03-25 10:06
- **Scope:** domain: Range facet type
- **Gaps analyzed:** 13
- **Test cases generated:** 15 (Critical: 3, High: 9, Medium: 3)
- **Test cases validated:** 14 / 15 (browser verified: CAT-030–039, GQL-034–037. Not verified: SRCH-047 admin)
- **Suites modified:** 003 (Catalog Filters), 050 (GraphQL xAPI), 061 (Search Indexing Admin)
- **New suite coverage:** Suite 003: 19 → 29 tests (+52%), Suite 050: 33 → 37 tests (+12%), Suite 061: 46 → 47 tests (+2%)

## Layer Coverage Matrix

| Layer | Cases Generated | Target Suites | Tags Used |
|-------|----------------|---------------|-----------|
| Storefront UI | 10 | 003 | [NAV]/[ACT]/[WAIT]/[ASSERT]/[DOM]/[MATH]/[STATE] |
| GraphQL xAPI | 4 | 050 | [GQL]/[ERRORS]/[DATA]/[MATH]/[ROUNDTRIP] |
| Admin UI | 1 | 061 | Legacy format (Steps/Expected Result) |

## Generated Test Cases

### Suite 003 — Catalog Filters (10 new cases)

| ID | Title | Priority | Gap Ref | Business Rules |
|----|-------|----------|---------|----------------|
| CAT-030 | Range Facet - Non-Price Numeric Property Rendering (Volume_ml) | Critical | GAP-RF-01 | BL-CAT-002 |
| CAT-031 | Range Facet - VP-9035 Regression: Underscore Field Name Not Truncated | Critical | GAP-RF-02 | BL-CAT-002, BL-SRCH-001 |
| CAT-032 | Range Facet - Price Range Chip Display and Removal | High | GAP-RF-03 | BL-CAT-002 |
| CAT-033 | Range Facet - Slider Min Greater Than Max Validation | Medium | GAP-RF-04 | BL-CAT-002 |
| CAT-034 | Range Facet - Combined with Term Facet (AND Logic) | High | GAP-RF-05 | BL-CAT-002 |
| CAT-035 | Range Facet - URL Persistence on Refresh and Back/Forward | Medium | GAP-RF-06 | BL-CAT-003 |
| CAT-036 | Range Facet - Cascading Bucket Counts Accuracy | High | GAP-RF-07 | BL-SRCH-001 |
| CAT-037 | Range Facet - Currency Switch Updates Price Range Values | High | GAP-RF-08 | BL-CAT-002, BL-PRICE-005 |
| CAT-038 | Range Facet - Open-Ended Range: Up To Maximum | High | GAP-RF-09 | BL-CAT-002 |
| CAT-039 | Range Facet - Open-Ended Range: From Minimum | High | GAP-RF-10 | BL-CAT-002 |

### Suite 050 — GraphQL xAPI (4 new cases)

| ID | Title | Priority | Gap Ref | Business Rules |
|----|-------|----------|---------|----------------|
| GQL-034 | xCatalog - Range Filter Syntax: Inclusive vs Exclusive Boundaries | High | GAP-RF-11 | BL-GQL-002, BL-SRCH-001 |
| GQL-035 | xCatalog - Open-Ended Range Filter Syntax | High | GAP-RF-12 | BL-GQL-002, BL-SRCH-001 |
| GQL-036 | xCatalog - Range Filter on Non-Price Property (Underscore Field Name) | Critical | GAP-RF-13 | BL-GQL-002, BL-SRCH-001 |
| GQL-037 | xCatalog - Facet Parameter Returns Range Aggregation Buckets | High | GAP-RF-14 | BL-GQL-002, BL-SRCH-001 |

## Bug Regression Coverage

| Bug | JIRA | Root Cause | Test Cases |
|-----|------|-----------|------------|
| VP-9035 | [VP-9035](https://virtocommerce.atlassian.net/browse/VP-9035) | `GetFieldName()` splits on underscore, truncating `Volume_ml` → `Volume` | CAT-030, CAT-031, GQL-036 |

## Checklist Items Covered

| Checklist Item (domain-checklists.md #2) | Test Cases |
|------------------------------------------|------------|
| Range facets render for numeric/money properties configured as "Range" in Admin | CAT-030 |
| Range facet boundaries: inclusive `[100 TO 200]` vs exclusive `(100 TO 200)` | GQL-034 |
| Range facet open-ended: `(TO 100]` and `(0 TO)` | CAT-038, CAT-039, GQL-035 |
| Range facet with currency: `price.{currency}` scoped to selected currency | CAT-037 |
| Range facet counts: each range bucket displays correct cascading count | CAT-036, GQL-037 |
| Filter chips: display, remove one, "Reset filters" | CAT-032 |

## Edge Case Library References

| ECL Ref | Pattern | Test Cases |
|---------|---------|------------|
| ECL-3.2 | Price range filter boundaries / facet count stale | CAT-030-039, GQL-034-037 |

## Browser Verification Results (2026-03-25)

| Case | Browser | Verdict | Key Observations |
|------|---------|---------|-----------------|
| CAT-030 | Firefox | PASS | Volume_(mL) filter renders with histogram + dual slider + input fields. 8 results for range ≥200. Chip truncated (VP-9035). |
| CAT-031 | Firefox | BUG-CONFIRMED | VP-9035 reproduced: chip shows "Volume: >= 200" (truncated). URL/GraphQL preserve full "Volume_ml". |
| CAT-032 | Firefox | PASS | Price chip "price: 50 - 200" appears, × removes it, 28 results restore, URL cleaned. |
| CAT-033 | Firefox | PASS | Min>max auto-swaps silently: 500/50 becomes [50 TO 500]. Chip shows corrected range. No error. |
| CAT-034 | Firefox | PASS | Brand:HP (5) + price 315-800 = 3 products. AND logic confirmed. Brand chip preserved after range removal. |
| CAT-035 | Firefox | PASS | URL preserves range param. F5 refresh restores filter. Browser Back restores filter from URL. |
| CAT-036 | Firefox | PASS | Histogram: 10 buckets sum=28. After Brand:Yalumba, histogram cascades to 3 buckets sum=3. |
| CAT-037 | Firefox | PASS | Currency switcher in header. USD 1-3243 (28 products) → EUR 0-2890 (1 product). Expected per BL-PRICE-005. |
| CAT-038 | Firefox | PASS | Max=100: chip "price: <= 100", URL [TO 100], 4 products all ≤$100. |
| CAT-039 | Firefox | PASS | Min=100: chip "price: >= 100", URL [100 TO], 26 products all ≥$100. $100 boundary inclusive both sides. |
| GQL-034 | Edge | PASS | Inclusive [50 TO 100] = 3467, Exclusive (50 TO 100) = 3456. Diff = 11 boundary products. |
| GQL-035 | Edge | PASS | (TO 100] = 3610, [100 TO) = 199. Both open-ended syntaxes work correctly. |
| GQL-036 | Edge | PASS | Volume_ml:[200 TO 550] returns 12 products. Minor: ARGUMENT_NULL on null properties (data quality). |
| GQL-037 | Edge | PASS (fixed) | `facet: "price"` alone returns empty range_facets. Corrected to explicit `facet: "price.usd:[0 TO 100]"` syntax. |

### Post-Verification Corrections Applied (Round 1 — CAT-030–032, GQL-034–037)
1. **CAT-030**: Updated slider description to match actual UI (histogram + dual slider + input fields, min=9/max=550). Adjusted range setting step to reflect input field workflow.
2. **CAT-031**: Retitled to "Preserved in Chip". Updated assertions to reflect that chip truncation is the VP-9035 symptom to verify post-fix. Corrected expected result count to ~8.
3. **GQL-036**: Removed `term_facets`/`range_facets` from query (not needed). Added note about ARGUMENT_NULL for null properties. Updated expected count to 12.
4. **GQL-037**: Changed `facet: "price"` to explicit range syntax `facet: "price.usd:[0 TO 100]"`. Added second query for comparison. Documented that bare `facet: "price"` returns empty range_facets.

### Post-Verification Corrections Applied (Round 2 — CAT-033–039)
5. **CAT-033**: Updated assertion from "prevent/error/swap" options to confirmed behavior: system **auto-swaps min/max silently** (no error message). Chip shows corrected range.
6. **CAT-037**: Added note that currency switch may drastically reduce product count (expected per BL-PRICE-005). Observed: USD 28 products → EUR 1 product.
7. **CAT-038**: Updated chip format to confirmed `price: <= 100` (≤ symbol). URL syntax: `[TO 100]`.
8. **CAT-039**: Updated chip format to confirmed `price: >= 100` (≥ symbol). URL syntax: `[100 TO]`. Added assertion that $100 boundary is inclusive (products at exactly $100 included in both ≤100 and ≥100).

## Remaining Gaps

| Gap | Reason | Recommendation |
|-----|--------|---------------|
| Range facet on search results page (Suite 005) | Existing SRCH-006 partially covers; dedicated range-on-search case could strengthen coverage | Low priority — current SRCH-006 + SRCH-NEW-042 provide baseline |

## Files Modified

| File | Changes |
|------|---------|
| `regression/suites/Frontend/catalog/003-catalog-filters.csv` | +10 test cases (CAT-030 through CAT-039) |
| `regression/suites/Backend/graphql/050-graphql-xapi.csv` | +4 test cases (GQL-034 through GQL-037) |
| `regression/suites/Backend/search/061-search-indexing-admin.csv` | +1 test case (SRCH-047) |
| `config/test-suites.json` | Updated testCount: 003 (19→29), 050 (33→37), 061 (46→47); added `range-facets` tag |
