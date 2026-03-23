# VCST-4793 / PR #873 -- Verification Report

## Bug Summary

**Title:** Saving product configuration with Product-type sections that have no predefined options silently sets `IsActive = false`

**Root Cause:** The `canBeEnabled` function in `product-configuration-detail.js` required Product-type sections to have at least one option (`section.options.length > 0`). When a Product section had 0 options, `canBeEnabled` returned false, and the `$watch` on it immediately set `isActive = false`. The same check existed in the backend (`CreateOrUpdateConfiguration` controller and `ImportProductConfigurationsAsync`).

**Fix (PR #873):** Changed `canBeEnabled` to only check `_.some(sections)` (at least one section exists), removing the requirement that Product sections must have options. Backend controllers updated similarly.

**Deployed as:** VirtoCommerce.Catalog_3.1013.0-pr-873-9ee6.zip

## Environment

| Property | Value |
|----------|-------|
| Platform URL | https://vcst-qa.govirto.com |
| Platform Version | 3.1009.0 |
| Module Version | VirtoCommerce.Catalog 3.1013.0-pr-873-9ee6 |
| Browser | Microsoft Edge (via playwright-edge) |
| Tester | qa-backend-expert (automated) |
| Date | 2026-03-23 |

## Test Results Summary

| # | Checklist Item | Result | Notes |
|---|---------------|--------|-------|
| 1 | **STR Run 1** -- Add Product section (0 options), save, reopen, IsActive=true | PASS | Bike with options: added QA-Test-NoOptions (Product, 0 options). After save and reopen, IsActive=true, toggle not disabled. |
| 2 | **STR Run 2** -- Toggle OFF/ON cycle, save, reopen | PASS | Same product. Toggled IsActive OFF then ON, saved. After reopen, IsActive=true persisted. |
| 3 | **STR Run 3** -- Different product (Off-Road Bike) | PASS | Added QA-Run3-Product-NoOpts (Product, 0 options). After save and reopen, IsActive=true, toggle not disabled. |
| 4 | **No-sections guard** -- Remove ALL sections, verify IsActive=false | PASS | Selected all 5 sections and deleted (not saved). IsActive toggle automatically switched to OFF. The `canBeEnabled = _.some(sections)` guard correctly returns false when sections array is empty. |
| 5 | **Product WITH options regression** | PASS | "Produts" section (Product type, 4 options) present throughout all tests. IsActive remained true and toggle was never disabled. No regression. |
| 6 | **Text/File section types** | PASS | "Text" and "Test" sections (both Text type) present throughout. IsActive remained true. (File type section not available in existing configs, but Text type confirmed working.) |
| 7 | **Console errors during saves** | PASS | No configuration-related errors in console. Pre-existing errors (401 on shipping endpoint, 404 on external image, AngularJS double-load) are unrelated. |
| 8 | **Mixed sections** | PASS | Bike with options had: Product WITH options (4), Product WITHOUT options (0), Text (x2), Variation (x1). All coexisted with IsActive=true. |

## Detailed Test Execution

### STR Runs 1-3 (Core Bug Verification)

**Method:** For each run, opened a product's Configuration blade, added a new section of type "Product" with no options, saved the configuration blade, closed and reopened it, then verified:
- `IsActive` toggle checked state via DOM inspection: `document.querySelectorAll('[ng-model="blade.currentEntity.isActive"]')` returned `[{checked: true, disabled: false}, {checked: true, disabled: false}]` on all 3 runs.
- The toggle was visible and interactive (not grayed out or disabled).
- The section persisted with "Type of section: Product | Options: 0" label.

**Products tested:**
- **Bike with options** (SKU: ZER-64605169) -- STR Runs 1 and 2
- **Off-Road Bike** (SKU: INN-69077289) -- STR Run 3

### No-Sections Guard (Checklist Item 4)

On "Bike with options", selected all 5 sections via "Select All" checkbox, clicked Delete. DOM inspection showed the configuration blade's `isActive` element changed to `checked: false` immediately (the `$watch` on `canBeEnabled` fired because `_.some([])` returns false). This confirms the empty-sections guard still works correctly after the fix.

Changes were discarded via Reset (not saved).

### Console Analysis

6 total console messages across the session:
- 3 errors: all pre-existing (shipping 401, external image 404, AngularJS double-load)
- 0 warnings
- No errors related to product configuration CRUD operations

## Observations (Non-Blocking)

1. **Helper text not updated:** The configuration blade still displays "each section with the 'Product' type must contain at least one option" under the Enable toggle. This text is now inaccurate given the fix, but it is informational only and does not block functionality. Consider updating in a follow-up.

2. **Spurious "Save changes" dialog:** After saving the configuration, closing the blade triggers a "Save changes?" dialog even though no further changes were made. This appears to be caused by the `$watch` on `canBeEnabled` re-dirtying the blade after each save. This is a pre-existing minor UX issue, not introduced by this PR.

3. **Two IsActive DOM elements:** `querySelectorAll('[ng-model="blade.currentEntity.isActive"]')` returns 2 elements due to AngularJS blade scope nesting. Both are consistent in normal operation. During the no-sections test, the parent scope element briefly showed `checked: true` while the configuration blade's element showed `checked: false` (expected, as only the inner scope receives the `$watch` update).

## Cleanup

All test sections created during verification have been removed:
- QA-Test-NoOptions removed from "Bike with options" -- saved
- QA-Run3-Product-NoOpts removed from "Off-Road Bike" -- saved

## Evidence

| File | Description |
|------|-------------|
| `01-config-blade-initial.png` | Initial state of Bike with options configuration (4 sections, IsActive ON) |
| `02-str-run1-isActive-preserved.png` | After adding Product section with 0 options: IsActive ON persisted |
| `03-str-run2-isActive-preserved.png` | After toggle OFF/ON cycle and save: IsActive ON persisted |
| `04-str-run3-offroad-isActive-preserved.png` | Off-Road Bike with Product section (0 options): IsActive ON persisted |
| `05-no-sections-isActive-false.png` | After deleting all sections: IsActive automatically switched to OFF |

## Verdict

**PASS** -- The fix in PR #873 correctly resolves VCST-4793. Product configurations with Product-type sections that have no predefined options now correctly preserve `IsActive = true` after save. The empty-sections guard continues to function (IsActive goes to false when all sections are removed). No regressions observed in existing section types or mixed configurations. No console errors related to the fix.

---

*Verified by: qa-backend-expert | 2026-03-23 | Platform 3.1009.0 | VirtoCommerce.Catalog 3.1013.0-pr-873-9ee6*
