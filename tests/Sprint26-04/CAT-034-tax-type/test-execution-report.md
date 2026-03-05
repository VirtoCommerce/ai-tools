# Test Execution Report — CAT-034: Add Tax Type to Product

## Summary

| Field | Value |
|-------|-------|
| **Test Case ID** | CAT-034 |
| **Title** | Add Tax Type to Product |
| **Date** | 2026-03-05 |
| **Environment** | https://vcst-qa.govirto.com (QA) |
| **Browser** | Firefox (playwright-firefox) |
| **Tester** | qa-testing-expert (automated) |
| **Verdict** | VALIDATED |
| **Pass Rate** | 1/1 — 100% |

---

## Test Objective

Verify that the Tax Type field exists on the product detail blade in the Virto Commerce Admin SPA, that it can be populated with values from the Tax module settings, and that the selected value is persisted correctly when the product is saved.

---

## Preconditions

- Admin credentials available: `admin` / `Password1!`
- Backend URL: `https://vcst-qa.govirto.com`
- Catalog > Electronics > Televisions > Sony category accessible
- At least one product available in the Sony category

**Note on test data prerequisite:** At test start, no Tax Type values were configured in the system (Settings > Tax > General > Tax types was empty). As part of this test execution, a "Standard" tax type was added to the system settings to enable full end-to-end validation of the field. This is consistent with the test case — the field's usability depends on the Tax module having dictionary values defined.

---

## Test Steps & Results

### Step 1 — Navigate to Admin and Login

| | |
|-|-|
| **Action** | Navigate to `https://vcst-qa.govirto.com`, enter admin/Password1!, click Sign In |
| **Expected** | Admin workspace dashboard loads |
| **Actual** | Dashboard loaded successfully. Admin user visible in top-right corner. |
| **Status** | PASS |
| **Evidence** | `test-results/CAT-034/01-login-page.png`, `test-results/CAT-034/02-admin-workspace.png` |

### Step 2 — Navigate to Catalog Module

| | |
|-|-|
| **Action** | Click "Catalog" in the left navigation menu |
| **Expected** | Catalog list blade opens showing available catalogs |
| **Actual** | Catalog list opened with 23 catalogs visible |
| **Status** | PASS |
| **Evidence** | `test-results/CAT-034/03-catalog-list.png` |

### Step 3 — Navigate to a Product

| | |
|-|-|
| **Action** | Electronics > Televisions > Sony > Sony W600B Series 47.6" Full HD Smart LED TV (SKU: SOKDL48W600B) |
| **Expected** | Product detail blade opens |
| **Actual** | Product detail blade opened for SOKDL48W600B (productId: 93beb4e92dba4a08a173aa0a0cf0cffb) |
| **Status** | PASS |
| **Evidence** | `test-results/CAT-034/04-televisions-category.png`, `test-results/CAT-034/05-sony-category.png`, `test-results/CAT-034/06-product-detail-blade.png` |

### Step 4 — Verify Tax Type Field Exists

| | |
|-|-|
| **Action** | Inspect the product detail form for the Tax Type field |
| **Expected** | Tax Type field/widget is visible on the product detail blade |
| **Actual** | Tax Type field confirmed present in the main product details section, same row as the "Vendor" field. It is a ui-select (Select2/AngularJS) dropdown with label "Tax type" and placeholder "Select..." |
| **Field location** | Main product details blade (no tab change required), positioned in a two-column row alongside the "Vendor" select field |
| **Angular binding** | `ng-model="blade.item.taxType"` |
| **Status** | PASS |
| **Evidence** | `test-results/CAT-034/06-product-detail-blade.png` |

### Step 5a — Configure Tax Type Values (prerequisite)

| | |
|-|-|
| **Action** | Navigate to Settings > Tax > General > Tax types, add "Standard" as a tax type value, save |
| **Expected** | Tax type value "Standard" is added to the platform dictionary and persisted |
| **Actual** | Settings > Tax > General blade opened. Tax types dictionary editor was empty. "Standard" was added via the Add row action. Settings blade was saved successfully (Save/Reset buttons returned to inactive state). API confirmed: `GET /api/platform/settings/values/VirtoCommerce.Core.General.TaxTypes` returned `["Standard"]` |
| **Status** | PASS |
| **Evidence** | `test-results/CAT-034/09-settings-page.png`, `test-results/CAT-034/10-tax-general-settings.png`, `test-results/CAT-034/11-tax-types-editor.png`, `test-results/CAT-034/12-tax-type-add-row.png`, `test-results/CAT-034/13-tax-type-standard-added.png`, `test-results/CAT-034/14-settings-saved.png` |

### Step 5b — Verify Tax Type Dropdown Populates from Settings

| | |
|-|-|
| **Action** | Return to the product, open the Tax type dropdown |
| **Expected** | Dropdown shows available tax type values from the settings dictionary |
| **Actual** | Tax type dropdown opened and showed "Standard" as an available option (highlighted in blue). Confirmed via screenshot and Angular controller inspection: `ctrl.items = ["Standard"]` |
| **Status** | PASS |
| **Evidence** | `test-results/CAT-034/15-product-blade-loaded.png`, `test-results/CAT-034/16-tax-type-dropdown-open.png` |

### Step 6 — Select Tax Type Value

| | |
|-|-|
| **Action** | Select "Standard" from the Tax type dropdown |
| **Expected** | "Standard" is displayed in the Tax type field |
| **Actual** | "Standard" selected and displayed in the Tax type field with a clear (x) button and dropdown arrow. Save button in toolbar became active, indicating the form is dirty and ready to save. |
| **Status** | PASS |
| **Evidence** | `test-results/CAT-034/17-tax-type-standard-selected.png` |

### Step 7 — Save the Product

| | |
|-|-|
| **Action** | Click Save button in the product blade toolbar |
| **Expected** | Product saves successfully, no errors |
| **Actual** | Save button clicked. Network log confirmed: `POST /api/catalog/products => [200]`. Product was reloaded: `GET /api/catalog/products/93beb4e92dba4a08a173aa0a0cf0cffb?respGroup=2015 => [200]`. No errors in console. |
| **Status** | PASS |
| **Evidence** | `test-results/CAT-034/18-product-saving.png`, Network log |

### Step 8 — Verify Tax Type Persisted

| | |
|-|-|
| **Action** | Navigate away from the product, then reopen it |
| **Expected** | Tax type field shows "Standard" after reload |
| **Actual** | After navigating away and back, Tax type field displays "Standard". Angular controller confirmed: `ctrl.selected = "Standard"`. Direct API verification: `GET /api/catalog/products/93beb4e92dba4a08a173aa0a0cf0cffb?respGroup=2015` returned `taxType: "Standard"` (HTTP 200). |
| **Status** | PASS |
| **Evidence** | `test-results/CAT-034/19-tax-type-persisted-verification.png`, API response: `{"status":200,"taxType":"Standard","id":"93beb4e92dba4a08a173aa0a0cf0cffb","name":"Sony W600B Series 47.6\" Full HD Smart LED TV","code":"SOKDL48W600B"}` |

---

## Findings

### Tax Type Field — Confirmed Present

- **Location:** Main product details blade, top section (visible without scrolling or switching tabs)
- **Position:** Two-column row alongside the "Vendor" field
- **Field type:** Angular ui-select (Select2) dropdown
- **Angular binding:** `ng-model="blade.item.taxType"`
- **API field:** `taxType` in `POST /api/catalog/products` request body and `GET /api/catalog/products/{id}` response

### Available Values

- Values are loaded dynamically from the Virto Commerce Tax module settings dictionary
- Setting key: `VirtoCommerce.Core.General.TaxTypes`
- API endpoint for values: `GET /api/platform/settings/values/VirtoCommerce.Core.General.TaxTypes`
- At test start: empty (no values configured). Added "Standard" during test execution.
- Dropdown populated correctly once values were configured in Settings

### Save Behavior

- `POST /api/catalog/products` — HTTP 200 confirmed
- Tax type value persisted correctly across navigation (backend round-trip confirmed)
- No errors in console or network during save

### Observations / Notes

1. The Tax type dropdown uses `refresh="fetch($select)"` with `refresh-delay=300` — values are fetched lazily from the API when the dropdown is opened, not pre-loaded. This is correct behavior.
2. When no tax types are configured in system settings, the dropdown is empty but functional — it renders correctly and accepts values once the dictionary is populated. This is expected behavior, not a bug.
3. The ui-select dropdown in the VC Admin SPA requires `dispatchEvent` for programmatic interaction (standard Playwright click times out on Angular `ng-click` elements in the grid/blade context). This is a known testing pattern for this platform.

---

## API Evidence

```
GET  /api/platform/settings/values/VirtoCommerce.Core.General.TaxTypes  => 200 ["Standard"]
GET  /api/catalog/products/93beb4e92dba4a08a173aa0a0cf0cffb?respGroup=2015 => 200 {"taxType":"Standard",...}
POST /api/catalog/products                                                => 200 (save)
```

---

## Screenshots Index

| # | File | Description |
|---|------|-------------|
| 01 | `01-login-page.png` | Admin login page |
| 02 | `02-admin-workspace.png` | Admin workspace dashboard after login |
| 03 | `03-catalog-list.png` | Catalog module list (23 catalogs) |
| 04 | `04-televisions-category.png` | Televisions subcategory |
| 05 | `05-sony-category.png` | Sony products list |
| 06 | `06-product-detail-blade.png` | Product detail blade — Tax type field visible (empty) |
| 07 | `07-tax-type-dropdown-attempt.png` | First dropdown open attempt |
| 08 | `08-tax-type-dropdown-open.png` | Dropdown open — empty (no tax types configured yet) |
| 09 | `09-settings-page.png` | Settings module |
| 10 | `10-tax-general-settings.png` | Tax > General settings blade |
| 11 | `11-tax-types-editor.png` | Tax types dictionary editor (empty) |
| 12 | `12-tax-type-add-row.png` | Add row in Tax types editor |
| 13 | `13-tax-type-standard-added.png` | "Standard" added to Tax types list |
| 14 | `14-settings-saved.png` | Tax settings saved (Save button inactive) |
| 15 | `15-product-blade-loaded.png` | Product blade reloaded — Tax type field still "Select..." |
| 16 | `16-tax-type-dropdown-open.png` | Tax type dropdown open — "Standard" option visible |
| 17 | `17-tax-type-standard-selected.png` | "Standard" selected in Tax type field |
| 18 | `18-product-saving.png` | Product save in progress |
| 19 | `19-tax-type-persisted-verification.png` | Tax type "Standard" shown after reload — persistence confirmed |

---

## Verdict

**VALIDATED**

All test objectives confirmed:

1. Tax Type field EXISTS on the product detail blade — confirmed visually and via DOM inspection
2. Field LOCATION identified — main details section, alongside Vendor, visible without tab switching
3. Available VALUES — dynamically loaded from the Tax module settings dictionary (`VirtoCommerce.Core.General.TaxTypes`); populated correctly once values are configured
4. Field can be CHANGED — "Standard" selected successfully
5. Value SAVES correctly — `POST /api/catalog/products` returned HTTP 200
6. Value PERSISTS — confirmed via UI reload and direct API verification (`taxType: "Standard"` in GET response)

No bugs found. The Tax type feature functions as expected.
