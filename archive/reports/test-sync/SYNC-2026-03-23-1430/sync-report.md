# Test Sync Report — SYNC-2026-03-23-1430

## Summary
- **Source:** [PR #873](https://github.com/VirtoCommerce/vc-module-catalog/pull/873) — `fix: Stop silently resetting product configuration IsActive`
- **Date:** 2026-03-23
- **Status:** PR is **open** (not merged) — browser verification skipped
- **Changed modules:** Catalog (Configurable Products subsystem)
- **Affected suites:** 052, 072c (direct); 072, 072b (should-run, no changes needed)

## Change Inventory

| Module | Layer | Files Changed | Breaking | New Features |
|--------|-------|--------------|----------|-------------|
| Catalog | Backend API | `CatalogModuleConfigurationsController.cs` (-10/+2) | None | Product sections with no predefined options no longer force IsActive=false |
| Catalog | Backend Import/Export | `CatalogExportImport.cs` (-6/+2) | None | Same fix applied to import path |
| Catalog | Admin UI | `product-configuration-detail.js` (-2/+2) | None | `canBeEnabled` no longer checks Product section options; Active toggle not blocked |

**Root cause:** The validation assumed all Product-type sections must have predefined options to be valid. Some Product sections use dynamically resolved options — the check was incorrect.

**New behavior:** Only configurations with **no sections at all** (`Sections.IsNullOrEmpty()`) get `IsActive = false`. The Product-section-options check is removed.

## Impact Matrix

| Suite | Total Cases | Stale | Broken | Incomplete | New Needed | Valid |
|-------|------------|-------|--------|------------|------------|-------|
| 052 | 15 | 0 | 0 | 0 | 3 | 15 |
| 072 | ~38 | 0 | 0 | 0 | 0 | ~38 |
| 072b | ~50 | 0 | 0 | 0 | 0 | ~50 |
| 072c | 23 | 0 | 0 | 0 | 1 | 23 |

No existing cases are stale or broken — all existing tests work with configurations that HAVE predefined options, so the relaxed validation does not affect them.

## Cases Updated

None — no existing cases required modification.

## Cases Deprecated

None.

## New Cases Generated

| Case ID | Suite | Title | Layer | Priority |
|---------|-------|-------|-------|----------|
| CFG-CA-016 | 052 | Save Configuration with Product Section Having No Predefined Options — IsActive Preserved | Backend API | Critical |
| CFG-CA-017 | 052 | Admin UI Active Toggle Not Blocked When Product Section Has No Options | Admin UI | High |
| CFG-CA-018 | 052 | Save Configuration with No Sections — IsActive Forced to False | Backend API | High |
| CFG-IMP-001 | 072c | Import Configuration with Product Section Without Options — IsActive Preserved | Import/Export | High |

### New Case Details

**CFG-CA-016 (Critical)** — Core regression for the bug fix. Calls `POST /api/catalog/products/configurations` with `isActive: true` and a Product section with `options: []`. Asserts `isActive` is NOT silently reset to `false` in the response.

**CFG-CA-017 (High)** — Admin UI regression. Opens a configuration with a Product section with no options, verifies the Active toggle is enabled (not grayed out), can be toggled ON, and stays ON after save + re-open (no `$watch` silent reset).

**CFG-CA-018 (High)** — Negative/boundary case. Verifies the remaining guard: saving a configuration with `sections: []` (empty) DOES correctly force `isActive = false`.

**CFG-IMP-001 (High)** — Import path regression. Imports a configuration JSON with a Product section with no options and `isActive: true`, verifies `isActive` is preserved through the `ImportProductConfigurationsAsync` code path.

## Environment Verification

Skipped — PR #873 is still open. Artifact build available: `VirtoCommerce.Catalog_3.1013.0-pr-873-9ee6.zip`

## Quality Gate

| Check | Status |
|-------|--------|
| All STALE cases updated | PASS (0 stale) |
| All BROKEN cases addressed | PASS (0 broken) |
| New behavior has coverage | PASS (4 new cases) |
| No ID conflicts | PASS |
| CSV structure valid | PASS |
| testCount updated in manifest | PASS (052: 15→18, 072c: 23→24) |

## Recommended Next Steps
- [ ] Review new cases: `git diff regression/suites/`
- [ ] After PR #873 is merged and deployed to QA, run `/qa-regression configurable-products` to execute all 4 suites
- [ ] Prioritize running CFG-CA-016 and CFG-CA-017 first — they directly verify the fix
- [ ] Run `/qa-test-lifecycle suite 052 --skip-generate` to validate the updated suite
