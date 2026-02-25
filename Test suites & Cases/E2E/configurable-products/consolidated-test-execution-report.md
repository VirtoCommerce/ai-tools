# Configurable Products E2E - Consolidated Test Execution Report

## Test Information

| Field | Value |
|-------|-------|
| **Date** | 2026-02-24 |
| **Sprint** | Sprint 26-05 |
| **Environment** | QA |
| **Frontend URL** | https://vcst-qa-storefront.govirto.com |
| **Backend URL** | https://vcst-qa.govirto.com |
| **Platform Version** | 3.1005.0 |
| **Storefront Version** | 2.42.0-alpha.2241 |
| **Store** | B2B-store |
| **Test Account** | Elena Mutykova / Coffee shop |
| **Source CSV** | `tests/configurable-products/testrail-import-e2e.csv` |
| **Total Test Cases** | 27 (TC-E2E-001 through TC-E2E-027) |

### Execution Agents & Browsers

| Phase | Agent | Browser | Scenarios |
|-------|-------|---------|-----------|
| Phase 1A | qa-frontend-expert | Chromium (playwright-chrome) | 1, 3 |
| Phase 1B | qa-backend-expert | Edge (playwright-edge) | 2, 4 |
| Phase 2 | qa-frontend-expert | Chromium (playwright-chrome) | 5 |
| Phase 3 | qa-frontend-expert | Chromium (playwright-chrome) | 6, 7 |

---

## Executive Summary

| Metric | Value |
|--------|-------|
| **Total Tests** | 27 |
| **Passed** | 19 |
| **Failed** | 5 |
| **Blocked** | 3 |
| **Pass Rate** | 70.4% |
| **Bugs Found** | 5 (3x P1, 2x P2) |
| **Release Recommendation** | BLOCKED |

### Results by Scenario

| # | Scenario | Tests | Pass | Fail | Blocked | Rate |
|---|----------|-------|------|------|---------|------|
| 1 | Single Radio Section | 5 | 5 | 0 | 0 | 100% |
| 2 | Multiple Sections (Laptop) | 5 | 1 | 2 | 2 | 20% |
| 3 | Sale Price vs List Price | 3 | 3 | 0 | 0 | 100% |
| 4 | Out of Stock Option | 3 | 0 | 3 | 0 | 0% |
| 5 | Complete E2E with Checkout | 4 | 4 | 0 | 0 | 100% |
| 6 | Admin Edit Option Price/Name | 3 | 2 | 0 | 1 | 67% |
| 7 | Admin Delete Option/Section | 4 | 4 | 0 | 0 | 100% |
| | **TOTAL** | **27** | **19** | **5** | **3** | **70.4%** |

---

## Full Test Results Matrix

### Scenario 1: Single Radio Section (5/5 PASS)

| ID | Title | Priority | Status | Notes |
|----|-------|----------|--------|-------|
| TC-E2E-001 | Config widget renders with single optional radio section | Critical | **PASS** | All 5 options visible, None default, prices correct |
| TC-E2E-002 | Optional section allows add-to-cart with None selected | Critical | **PASS** | No validation error, cart shows $350.00 base price |
| TC-E2E-003 | Selected upgrade option reflected in cart | High | **PASS** | Engine Motor: cart shows $575.00 ($350+$225), components list correct |
| TC-E2E-004 | Widget renders correctly after page refresh | Medium | **PASS** | All options persist after location.reload() |
| TC-E2E-005 | Non-configurable product has no config widget | Medium | **PASS** | Gold-Plated Silver Set PDP has no "Configure the parameters" section |

**Product Used:** Bike with options (SKU: CVQ-54616437, Base: $350.00)

### Scenario 2: Multiple Sections -- Laptop (1/5 PASS)

| ID | Title | Priority | Status | Notes |
|----|-------|----------|--------|-------|
| TC-E2E-006 | Create Laptop with Two Required Sections and Verify Multi-Section Price Math | Critical | **FAIL** | Option prices $0.00, sections show "optional" not "required", product unavailable (BUG-3) |
| TC-E2E-007 | Required Sections Block Add-to-Cart When Unselected | Critical | **BLOCKED** | Product unavailable, cannot test cart validation |
| TC-E2E-008 | Price Math for All 9 Multi-Section Combinations | High | **FAIL** | All combos show base price only ($999), options add $0 (BUG-3) |
| TC-E2E-009 | Multi-Section Configuration Preserved in Cart | High | **BLOCKED** | Cannot add to cart due to product unavailability |
| TC-E2E-010 | Section Display Order Matches Admin | High | **PASS** | RAM section before Storage matches displayOrder |

**Product Used:** Test Config Laptop 20260224 (SKU: LAPTOP-CFG-20260224, Base: $999.00)

### Scenario 3: Sale Price vs List Price (3/3 PASS)

| ID | Title | Priority | Status | Notes |
|----|-------|----------|--------|-------|
| TC-E2E-011 | Sale price with strikethrough list price on config option | High | **PASS** | Rear wheel: $88.00 sale / $126.00 strikethrough list |
| TC-E2E-012 | Sale price takes precedence over list price | High | **PASS** | PDP shows $526.00 sale / $602.00 list when Rear wheel selected |
| TC-E2E-013 | Sale price reflected correctly in cart total | High | **PASS** | Cart: Subtotal $602, Discount -$76, Tax $105.20, Total $631.20 |

**Product Used:** Bike with options (SKU: CVQ-54616437, Rear wheel sale: $88.00 / list: $126.00)

### Scenario 4: Out of Stock Option (0/3 PASS)

| ID | Title | Priority | Status | Notes |
|----|-------|----------|--------|-------|
| TC-E2E-014 | Out-of-Stock Option Disabled and Required Section Blocks Purchase | High | **FAIL** | OOS option fully selectable, no visual indicator, addable to cart (BUG-1) |
| TC-E2E-015 | Out-of-Stock Option Indicated and Non-Selectable | Medium | **FAIL** | Zero visual differentiation between OOS and in-stock options (BUG-1) |
| TC-E2E-016 | All Options OOS -- Add to Cart Should Be Disabled | High | **FAIL** | All options OOS but product is fully purchasable (BUG-2) |

**Products Used:** Test Config OOS Bike (SKU: BIKE-OOS-CFG-20260224), Test Config AllOOS (SKU: CFG-ALLOOS-20260224)

### Scenario 5: Complete E2E with Checkout (4/4 PASS)

| ID | Title | Priority | Status | Notes |
|----|-------|----------|--------|-------|
| TC-E2E-017 | Complete purchase flow with configured product | Critical | **PASS** | Order CO260224-00007 completed via Manual payment |
| TC-E2E-018 | Verify order history shows config details (Storefront + Admin) | High | **PASS** | Config "Seat" verified in both storefront and Admin SPA |
| TC-E2E-019 | Multiple configurable products in single checkout | High | **PASS** | Order CO260224-00009: Bike+Pedals ($364) + Off-Road Bike+Engine ($630) |
| TC-E2E-020 | Cart quantity update for configurable product | Medium | **PASS** | Stepper +/-, manual input, totals, volume discount, config preserved |

**Product Used:** Bike with options (SKU: CVQ-54616437), Off-Road Bike

### Scenario 6: Admin Edit Option Price/Name (2/3 PASS)

| ID | Title | Priority | Status | Notes |
|----|-------|----------|--------|-------|
| TC-E2E-021 | Edit option price in Admin and verify on frontend | High | **PASS** | Blue Frame $0.01 -> $25.00, storefront reflected immediately |
| TC-E2E-022 | Verify cart reflects updated option price | High | **BLOCKED** | Product has no inventory, "Stock alert" shown instead of Add to Cart |
| TC-E2E-023 | Edit option name in Admin and verify on frontend | Medium | **PASS** | "Blue Frame" renamed to "Azure Frame", storefront updated |

**Product Used:** Test Config Bike 20260224 (SKU: BIKE-CFG-20260224, Base: $200.00)

### Scenario 7: Admin Delete Option/Section (4/4 PASS)

| ID | Title | Priority | Status | Notes |
|----|-------|----------|--------|-------|
| TC-E2E-024 | Delete an option in Admin and verify frontend | High | **PASS** | Red Frame deleted, 3 options remain |
| TC-E2E-025 | Delete entire section in Admin and verify frontend | High | **PASS** | Storage section deleted, only RAM remains |
| TC-E2E-026 | Delete only section removes config widget entirely | High | **PASS** | RAM deleted, product reverts to standard non-configurable |
| TC-E2E-027 | Delete option from required section forces re-selection | Medium | **PASS** | Ltd Black Frame deleted, 3 options remain, widget functional |

**Products Used:** Test Config Bike (BIKE-CFG-20260224), Test Config Laptop (LAPTOP-CFG-20260224), Test Config OOS Bike (BIKE-OOS-CFG-20260224)

---

## Bugs Found (5 Total)

### BUG-1 [P1]: Out-of-Stock Configuration Options Have No Visual Indicator and Are Fully Selectable

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Priority** | P1 - Release Blocker |
| **Affects** | TC-E2E-014, TC-E2E-015 |
| **Component** | Configurable Products - Storefront PDP |

**Description:** Configuration option products with inventory quantity = 0 (out of stock) are rendered identically to in-stock options. No disabled state, no greyed-out appearance, no "Sold out" or "Out of Stock" label. Users can select OOS options and add configured products to cart without warning.

**Impact:** Customers can purchase configurations with unavailable options, leading to fulfillment failures and order processing errors.

**STR:**
1. Create configurable product with options where one option has qty=0 in fulfillment center
2. Navigate to product PDP on storefront
3. Observe OOS option appears identical to in-stock options
4. Select OOS option and add to cart -- succeeds with no error

**Expected:** OOS options visually marked (greyed out, disabled, or labeled "Out of Stock") and non-selectable
**Actual:** OOS options fully interactive with no differentiation

---

### BUG-2 [P1]: All Options OOS in Required Section Does Not Block Add-to-Cart

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Priority** | P1 - Release Blocker |
| **Affects** | TC-E2E-016 |
| **Component** | Configurable Products - Cart Validation |

**Description:** When ALL options in a required configuration section have zero inventory, the Add to Cart button remains enabled. Product can be added to cart and purchased with OOS options.

**Impact:** Enables creation of unfulfillable orders when all configuration options in a required section are out of stock.

**STR:**
1. Create configurable product with required section where ALL option products have qty=0
2. Navigate to PDP on storefront
3. Select any option (all OOS but selectable per BUG-1)
4. Add to cart -- succeeds with no validation error

**Expected:** Add to Cart disabled or validation error when all required section options are OOS
**Actual:** Product fully purchasable

---

### BUG-3 [P1]: Option Product Prices Not Resolving on Storefront (Scenario 2 Laptop)

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Priority** | P1 |
| **Affects** | TC-E2E-006, TC-E2E-008 |
| **Component** | Configurable Products - Price Resolution |

**Description:** In Scenario 2 (Laptop with RAM and Storage sections), all option product prices display as $0.00 on the storefront PDP despite having valid prices in the BeerUSD pricelist (confirmed via REST API). Product also shows as unavailable ("Stock alert") despite having inventory.

**Impact:** Price calculations incorrect; customers see base price only. Product may be unpurchasable despite valid inventory.

**Notes:** May be related to how products created via REST API resolve prices on storefront. Scenario 1 products (existing catalog products) work correctly. Further investigation needed to isolate whether this is API creation-specific or a broader platform issue.

---

### BUG-4 [P2]: Product Configuration API PATCH/GET Endpoints Return 404

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Priority** | P2 |
| **Affects** | API consumers |
| **Component** | Platform REST API - Product Configuration |

**Description:** `PATCH /api/catalog/products/configurations/{id}` and `GET /api/catalog/products/configurations/{id}` endpoints return 404 for both configuration ID and product ID. Only `POST /api/catalog/products/configurations/search` works for retrieval.

**Workaround:** Use `POST /api/catalog/products/configurations` to re-create/update entire configuration object.

---

### BUG-5 [P2]: Product Configuration isActive Defaults to False via API

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Priority** | P2 |
| **Affects** | API consumers |
| **Component** | Platform REST API - Product Configuration |

**Description:** When creating a product configuration via `POST /api/catalog/products/configurations`, the `isActive` field defaults to `false` even when not explicitly set. Configuration widget does not appear on storefront until `isActive` is explicitly set to `true`.

**Workaround:** Always explicitly set `isActive: true` when creating configurations via API.

---

## Orders Created During Testing

| Order Number | Test Case | Products | Payment | Total | Status |
|-------------|-----------|----------|---------|-------|--------|
| CO260224-00006 | TC-E2E-017 (failed) | Bike + Seat (1x) | Authorize.Net (FAILED) | -- | Payment required |
| CO260224-00007 | TC-E2E-017 | Bike + Seat (1x) | Manual (PO-TC017-CFG-001) | $618.00 | New |
| CO260224-00009 | TC-E2E-019 | Bike+Pedals + Off-Road Bike+Engine | Manual (PO-TC019-MULTI-CFG) | $1,372.80 | New |

---

## Test Products Created in QA

| Product | SKU | Catalog | State After Testing |
|---------|-----|---------|---------------------|
| Test Config Bike 20260224 | BIKE-CFG-20260224 | Configurable products -> b2b-mixed | Modified: Blue Frame renamed to Azure Frame ($25.00), Red Frame deleted |
| Test Config Laptop 20260224 | LAPTOP-CFG-20260224 | Configurable products -> b2b-mixed | Modified: All config sections deleted, now non-configurable |
| Test Config OOS Bike 20260224 | BIKE-OOS-CFG-20260224 | Configurable products -> b2b-mixed | Modified: Ltd Black Frame deleted, 3 options remain |
| Test Config AllOOS 20260224 | CFG-ALLOOS-20260224 | Configurable products -> b2b-mixed | Unchanged |

---

## Additional Issues Observed

| Issue | Severity | Impact |
|-------|----------|--------|
| Authorize.Net test cards declined in QA | High | Blocks payment testing; used Manual payment workaround |
| Failed payment orders consume inventory | Medium | Inventory not released on payment failure |
| Admin direct URL navigation doesn't load Configuration widget | Medium | Must navigate through full UI path |
| Card brand icon highlighting incorrect (Amex shows for Visa) | Low | Cosmetic only |

---

## Key Observations

1. **Working well:** Single-section configurable products (Scenario 1), sale pricing with strikethrough (Scenario 3), complete checkout flow (Scenario 5), and Admin CRUD operations (Scenarios 6 & 7) all function correctly.

2. **Critical gaps:** Out-of-stock handling for configuration options is completely missing -- no visual indicators, no selection blocking, no cart validation. This is the primary release blocker.

3. **Price resolution issue:** Products created via REST API may have price/inventory resolution issues on storefront that don't affect products created through Admin UI. Needs further investigation.

4. **Admin-to-storefront sync:** All Admin edits (price changes, name changes, option deletions, section deletions) propagate to storefront immediately without manual reindexing.

5. **Sale pricing approach:** Cart uses discount-based display (Subtotal = list price, Discount = savings, Total = sale price + tax). This is transparent and correct.

---

## Release Recommendation

**BLOCKED** -- The configurable products feature should not be released until the following P1 bugs are resolved:

1. **BUG-1:** OOS options must be visually differentiated and non-selectable
2. **BUG-2:** All-OOS required sections must block Add to Cart
3. **BUG-3:** Price resolution for API-created products needs investigation

### Conditions for Re-test
- Fix BUG-1 and BUG-2 (OOS handling)
- Investigate and fix BUG-3 (price resolution)
- Re-execute Scenarios 2 and 4 (10 tests)
- Verify TC-E2E-022 with proper inventory setup

---

## Phase Reports

| Phase | Report Location | Scope |
|-------|----------------|-------|
| Phase 1A | `tests/configurable-products-e2e/test-execution-report.md` | Scenarios 1, 3 (8 tests) |
| Phase 1B | `tests/Sprint26-05/configurable-products-e2e/test-execution-report.md` | Scenarios 2, 4 (8 tests) |
| Phase 2 | `tests/Sprint26-03/TC-E2E-017-020/test-execution-report.md` | Scenario 5 (4 tests) |
| Phase 3 | `tests/configurable-products/test-execution-report-scenarios-6-7.md` | Scenarios 6, 7 (7 tests) |
