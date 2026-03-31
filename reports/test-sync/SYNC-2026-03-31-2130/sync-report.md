# Test Sync Report — SYNC-2026-03-31-2130

## Summary
- **Source:** VCST-4713 — PR #871 (vc-module-catalog) + PR #105 (vc-module-x-cart) + PR #2225 (vc-frontend)
- **Date:** 2026-03-31
- **Changed modules:** Catalog, xCart, Frontend Theme
- **Affected suites:** 052, 072 (direct); 072b, 072c, 050b, 028-030 (downstream)

## Change Inventory

| Module | Repo | PR | Layer | Files | Breaking | New Features |
|--------|------|----|-------|-------|----------|--------------|
| Catalog | vc-module-catalog | #871 | backend, admin | 29 | No | `DependsOnSectionId` FK, Admin "Depends On" dropdown, DB migrations (3 providers), 13 localizations |
| xCart | vc-module-x-cart | #105 | graphql, validation | 7 | No | `ConfigurationSectionType.dependsOnSectionId` GraphQL field, cart validation skip for hidden required sections, 2 unit tests |
| Frontend | vc-frontend | #2225 | storefront | 4 | No | `hiddenSectionIds` composable, conditional `v-if` rendering, `clearHiddenSectionValues()`, validation/defaults skip |

### Artifacts for QA Deployment

| Component | Artifact | Version |
|-----------|----------|---------|
| Catalog Module | `VirtoCommerce.Catalog_3.1014.0-pr-871-c972.zip` | 3.1014.0-pr-871 |
| xCart Module | `VirtoCommerce.XCart_3.1005.0-pr-105-e3a7.zip` | 3.1005.0-pr-105 |
| Frontend Theme | `vc-theme-b2b-vue-2.45.0-pr-2225-655d-655d1d46.zip` | 2.45.0-pr-2225 |

**All 3 artifacts must be deployed together.**

## Impact Matrix

| Suite | Before | After | Stale | Broken | Incomplete | New | Valid |
|-------|--------|-------|-------|--------|------------|-----|-------|
| 052 (Admin) | 18 | 24 | 0 | 0 | 0 | 6 | 18 |
| 072 (UI) | 19 | 29 | 0 | 0 | 0 | 10 | 19 |
| 072b (E2E) | 14 | 14 | 0 | 0 | 0 | 0 | 14 |
| 072c (Cross) | 12 | 12 | 0 | 0 | 0 | 0 | 12 |

**Total: 0 stale, 0 broken, 16 new cases generated.**

Downstream suites (050b xCart GraphQL, 028-030 Cart) are unaffected — the xCart validation change is additive.

## Cases Updated

*None — this is a purely additive feature with no changes to existing behavior.*

## New Cases Generated

### Suite 052 — Admin (6 cases)

| Case ID | Title | Priority |
|---------|-------|----------|
| CFG-CA-019 | Set "Depends On" via UI — dropdown shows others, save persists | Critical |
| CFG-CA-020 | Clear "Depends On" — removal persists in UI and API | High |
| CFG-CA-021 | Delete parent section — dependent's FK cleared | High |
| CFG-CA-022 | Dropdown excludes self — self-reference impossible | High |
| CFG-CA-023 | Circular dependency A→B, B→A — document outcome | Medium |
| CFG-CA-024 | REST API round-trip — POST with dependsOnSectionId, GET confirms | Medium |

### Suite 072 — Storefront (10 cases)

| Case ID | Title | Priority |
|---------|-------|----------|
| CFG-PDP-020-COND | Dependent section hidden on initial page load | Critical |
| CFG-PDP-021-COND | Section appears when parent value selected | Critical |
| CFG-PDP-022-COND | Section disappears when parent deselected (None) | Critical |
| CFG-PDP-023-COND | Hidden section's value cleared on parent deselect | High |
| CFG-PDP-024-COND | Price excludes hidden section's option price | Critical |
| CFG-PDP-025-COND | Transitive chain A→B→C — C hidden when A has no value | High |
| CFG-PDP-026-COND | Required hidden section does NOT block add-to-cart | Critical |
| CFG-PDP-027-COND | Multiple siblings of same parent show/hide together | High |
| CFG-PDP-028-COND | Add-to-cart with visible+configured section — option in cart | Critical |
| CFG-PDP-029-COND | Add-to-cart with hidden section — option excluded from cart | Critical |

## Test Data Prerequisite

A seed product `@td(CFG_CONDITIONAL)` must be created before executing any new case:

| Section | Name | Type | Required | DependsOn |
|---------|------|------|----------|-----------|
| A | Base Options | Product | Yes | — |
| B | Accessories | Product | No | Section A |
| C | Installation | Product | Yes | Section B |
| D* | Warranty | Product | No | Section A |

\* Section D only needed for CFG-PDP-027-COND (multiple siblings test).

## Quality Gate

| Check | Status |
|-------|--------|
| All STALE cases updated | N/A (0 stale) |
| All BROKEN cases addressed | N/A (0 broken) |
| New behavior has coverage | PASS |
| No ID conflicts | PASS |
| CSV structure valid | PASS |
| testCount updated in manifest | PASS (052: 18→24, 072: 68→78) |

## Recommended Next Steps
- [ ] Deploy all 3 PR artifacts to QA environment
- [ ] Create seed product with conditional sections (`@td(CFG_CONDITIONAL)`)
- [ ] Add seed product to `test-data/products/configurable-products.csv` as CFG-022
- [ ] Run `/qa-test-lifecycle suite 052 --skip-generate` to validate admin cases
- [ ] Run `/qa-test-lifecycle suite 072 --skip-generate` to validate storefront cases
- [ ] Run `/qa-regression configurable-products` after lifecycle review
- [ ] Consider adding GraphQL cases to suite 050b for `dependsOnSectionId` field
