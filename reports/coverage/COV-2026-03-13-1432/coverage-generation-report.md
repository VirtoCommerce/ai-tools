# Coverage Generation Report — COV-2026-03-13-1432

## Summary
- **Run date:** 2026-03-13 14:32
- **Scope:** domain: configurable-products
- **Gaps analyzed:** 9
- **Test cases generated:** 34 (Critical: 7, High: 13, Medium: 14)
- **Test cases validated:** N/A (generation-only run, no browser validation)
- **Suite modified:** Suite 36 — Configurable Products Tests
- **New suite coverage:** 82 cases -> 116 cases (+41% increase)

## Layer Coverage Matrix

| Layer | Cases Generated | Target Suite | ID Prefixes | Tags Used |
|-------|----------------|--------------|-------------|-----------|
| GraphQL xAPI | 8 | 36 | CFG-GQL-001 to 008 | [GQL]/[AUTH]/[VAR]/[ERRORS]/[DATA]/[MATH] |
| Admin UI | 6 | 36 | CFG-ADM-001 to 006 | [BLADE]/[SAVE]/[ACT]/[TOAST]/[FORM] |
| Storefront UI | 20 | 36 | CFG-PROMO/MOB/A11Y/EDGE/B2B/TEXT/EDIT | [NAV]/[ACT]/[WAIT]/[DOM]/[STATE]/[MATH] |

## Gap Results

| Gap | Feature | Priority | Cases | IDs | Business Rules |
|-----|---------|----------|-------|-----|----------------|
| GAP-CFG-001 | GraphQL xAPI (Product/Text/File sections) | 7.5 | 8 | CFG-GQL-001–008 | BL-CFG-001, BL-CFG-002, BL-CFG-003 |
| GAP-CFG-002 | Admin UI CRUD (section management) | 6.0 | 6 | CFG-ADM-001–006 | — |
| GAP-CFG-003 | Promotions/Coupons + configured products | 7.0 | 4 | CFG-PROMO-001–004 | BL-PRICE-001, BL-PRICE-004 |
| GAP-CFG-004 | Mobile/Responsive (375px viewport) | 5.5 | 3 | CFG-MOB-001–003 | — |
| GAP-CFG-005 | Accessibility (keyboard, ARIA, screen reader) | 5.0 | 4 | CFG-A11Y-001–004 | — |
| GAP-CFG-006 | Cross-browser Edge | 4.5 | 1 | CFG-EDGE-001 | — |
| GAP-CFG-007 | B2B org context | 5.5 | 3 | CFG-B2B-001–003 | BL-B2B-001 |
| GAP-CFG-008 | Predefined text dictionary values | 4.0 | 2 | CFG-TEXT-001–002 | — |
| GAP-CFG-009 | Edit configuration in cart (non-Variation) | 6.5 | 3 | CFG-EDIT-001–003 | BL-CFG-003 |

## Key Highlights

### High-Value Additions
- **CFG-GQL-001–008**: First dedicated GraphQL test cases for non-Variation configurable sections. Covers `productConfiguration` query, `addItem` with `configurationItems`, `updateConfigurationItem` for Product/Text/File sections, and negative paths (invalid IDs, missing required sections).
- **CFG-PROMO-003**: Directly validates **BL-PRICE-001** discount stacking — coupon applies to post-sale-price total, not list price.
- **CFG-B2B-002**: Full B2B checkout with configured product including PO number flow.

### Manifest Fix
- `config/test-suites.json` updated: `testCount` changed from 62 to 116, `estimatedMinutes` from 120 to 180.
- The previous count of 62 was stale — the CSV already had 82 cases before this run.

## Files Modified

| File | Change |
|------|--------|
| `regression/suites/Frontend/36-configurable-products-tests.csv` | +34 test cases appended |
| `config/test-suites.json` | testCount: 62 -> 116, estimatedMinutes: 120 -> 180 |

## Files Created

| File | Purpose |
|------|---------|
| `reports/coverage/COV-2026-03-13-1432/gap-inventory.json` | Gap analysis results (9 gaps) |
| `reports/coverage/COV-2026-03-13-1432/batch-results.json` | Per-gap generation results |
| `reports/coverage/COV-2026-03-13-1432/new-cases.csv` | Intermediate: 34 new cases only |
| `reports/coverage/COV-2026-03-13-1432/coverage-generation-report.md` | This report |

## Remaining Gaps

| Gap | Reason | Recommendation |
|-----|--------|----------------|
| CONFIG domain in feature-domain-map.md | Not listed in the domain inventory | Add CONFIG domain with all features to `feature-domain-map.md` |
| Performance testing for config widget | Low priority (P2), deferred | Add in next full coverage run |
| Config with bulk/quick order | Edge case, no test data | Requires test data setup first |
