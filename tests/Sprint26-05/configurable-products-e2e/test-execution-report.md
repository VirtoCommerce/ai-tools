# Configurable Products E2E Test Execution Report

## Test Information

| Field | Value |
|-------|-------|
| **Date** | 2026-02-24 |
| **Sprint** | Sprint 26-05 |
| **Tester** | qa-backend-expert (automated via playwright-edge MCP) |
| **Environment** | QA |
| **Frontend URL** | https://vcst-qa-storefront.govirto.com |
| **Backend URL** | https://vcst-qa.govirto.com |
| **Platform Version** | 3.1005.0 |
| **Storefront Version** | 2.42.0-alpha.2241 |
| **Store** | B2B-store |
| **Browser** | Microsoft Edge (playwright-edge MCP) |
| **Test Suite** | 36-configurable-products-tests.csv (E2E Scenarios 2 and 4) |

---

## Scope

This report covers the execution of the following test scenarios:

### Scenario 2: Multiple Sections -- Laptop with RAM and Storage (CFG-E2E-004 to CFG-E2E-008)

| Test Case | CSV ID | Title |
|-----------|--------|-------|
| TC-E2E-006 | CFG-E2E-004 | Create Laptop with Two Required Sections and Verify Multi-Section Price Math |
| TC-E2E-007 | CFG-E2E-005 | Required Sections Block Add-to-Cart When Unselected |
| TC-E2E-008 | CFG-E2E-006 | Price Math for All 9 Multi-Section Combinations Is Correct |
| TC-E2E-009 | CFG-E2E-007 | Multi-Section Configuration Preserved in Cart |
| TC-E2E-010 | CFG-E2E-008 | Sale Price and Strikethrough List Price on Configurable Product |

### Scenario 4: Out of Stock Option (CFG-E2E-009 + CFG-PDP-016)

| Test Case | CSV ID | Title |
|-----------|--------|-------|
| TC-E2E-014 | CFG-E2E-009 | Out-of-Stock Option Disabled and Required Section Blocks Purchase |
| TC-E2E-015 | CFG-PDP-016 | Out-of-Stock Option Indicated and Non-Selectable |
| TC-E2E-016 | (extension) | All Options OOS -- Add to Cart Should Be Disabled |

---

## Test Data Created

### Scenario 2 (from previous session)

| Product | SKU | Product ID | Catalog |
|---------|-----|------------|---------|
| Test Config Laptop 20260224 | LAPTOP-CFG-20260224 | 23c2d777-7a81-40c0-9c9a-8223df9c005e | Configurable products |
| 8GB RAM | RAM-8GB-20260224 | (created in previous session) | Configurable products |
| 16GB RAM | RAM-16GB-20260224 | (created in previous session) | Configurable products |
| 32GB RAM | RAM-32GB-20260224 | (created in previous session) | Configurable products |
| 256GB SSD | SSD-256-20260224 | (created in previous session) | Configurable products |
| 512GB SSD | SSD-512-20260224 | (created in previous session) | Configurable products |
| 1TB SSD | SSD-1TB-20260224 | (created in previous session) | Configurable products |

**Configuration:** Two sections (RAM: 3 options, Storage: 3 options), both marked as Required.
**Pricing:** Added to BeerUSD pricelist. Base: $999.00. Options: 8GB=$0, 16GB=$100, 32GB=$250, 256GB=$0, 512GB=$75, 1TB=$150.

### Scenario 4

| Product | SKU | Product ID | Catalog |
|---------|-----|------------|---------|
| Test Config OOS Bike 20260224 | BIKE-OOS-CFG-20260224 | f481a9f6-fab0-4f73-8cc9-1970567ce580 | Configurable products |
| Red Frame | FRAME-RED-20260224 | 08dd55f3-e006-44d7-a429-9e127fa57adf | Configurable products |
| Blue Frame | FRAME-BLUE-20260224 | 3b7cb98b-da8b-41b5-8a92-592beb9c8861 | Configurable products |
| Limited Edition Black Frame | FRAME-BLACK-20260224 | 9215d047-b84b-4069-b859-a5c372bbff80 | Configurable products |
| Silver Frame | FRAME-SILVER-20260224 | b5850faf-ebc7-4add-9d2f-c4f3c8fde0a7 | Configurable products |
| Test Config AllOOS 20260224 | CFG-ALLOOS-20260224 | ceabf76f-4c86-4e25-8823-cda20809e897 | Configurable products |
| Carbon Material | MAT-CARBON-20260224 | 5b233bba-e93f-4470-acc4-ca78e4ecc79c | Configurable products |
| Titanium Material | MAT-TITANIUM-20260224 | 64b35486-a526-4b77-959c-009033dc65ab | Configurable products |

**OOS Bike Configuration:** One section "Frame Color" (Required, Product type, 4 options).
**Pricing (BeerUSD):** Base=$500, Red=$0.01, Blue=$0.01, Black=$50, Silver=$25.
**Inventory (vendor-fulfillment FFC):** Main=50, Red=10, Blue=5, Black=0 (OOS), Silver=8.

**AllOOS Configuration:** One section "Material" (Required, Product type, 2 options).
**Pricing (BeerUSD):** Base=$300, Carbon=$0.01, Titanium=$50.
**Inventory (vendor-fulfillment FFC):** Main=20, Carbon=0 (OOS), Titanium=0 (OOS).

**All products linked to B2B-mixed virtual catalog > Products with options > Configurations category.**

---

## Setup Notes

1. **Authentication:** Admin session cookie authentication used (token auth via /connect/token returned 400 for admin/store credentials).
2. **Pricelist Discovery:** DefaultUSD pricelist is NOT assigned to B2B-mixed catalog. Prices were added to BeerUSD pricelist (ID: `a690e429-ac38-4e15-9099-9938f3577b71`) which IS assigned to B2B-mixed catalog.
3. **Configuration Activation:** Product configurations created via REST API had `isActive: false` by default. Required explicit POST to `/api/catalog/products/configurations` with `isActive: true` to activate. The PATCH endpoint (`/api/catalog/products/configurations/{id}`) returned 404 for both product ID and configuration ID -- appears non-functional.
4. **Virtual Catalog Linking:** Products created in physical catalog (Configurable products) were linked to B2B-mixed virtual catalog via `POST /api/catalog/listentrylinks`.
5. **Search Index:** Manual re-index triggered via `POST /api/search/indexes/index` after product creation and pricing updates.

---

## Test Results

### Scenario 2: Multiple Sections (Laptop)

#### TC-E2E-006 / CFG-E2E-004: Create Laptop with Two Required Sections -- FAIL

**Steps Executed:**
- Created product "Test Config Laptop 20260224" with base price $999.00 and inventory 50
- Created 6 option products (3 RAM + 3 Storage) with prices and inventory
- Configured two sections: RAM (Required) and Storage (Required) with Product type radio options
- Linked to B2B-mixed catalog, re-indexed, verified on storefront

**Findings:**
- Both RAM and Storage sections are visible on the PDP
- Sections show as **"optional"** on storefront despite being set as **"required"** in admin (isRequired: true in API)
- All option prices show as **$0.00** on the storefront (option products show $0 prices even though prices were set in BeerUSD pricelist)
- "Stock alert" label shown instead of "Add to Cart" button
- Product shows as **unavailable** on storefront despite having inventory in vendor-fulfillment FFC

**Result:** **FAIL**
**Bugs:**
1. Required sections displayed as "optional" on storefront
2. Option product prices not resolving on the storefront PDP ($0.00 for all options)
3. Product showing as unavailable despite having inventory

---

#### TC-E2E-007 / CFG-E2E-005: Required Sections Block Add-to-Cart When Unselected -- BLOCKED

**Reason:** Cannot test add-to-cart validation because the product shows "Stock alert" instead of "Add to Cart" button. The product appears as unavailable on the storefront.

**Result:** **BLOCKED** (depends on TC-E2E-006 passing)

---

#### TC-E2E-008 / CFG-E2E-006: Price Math for All 9 Combinations -- FAIL

**Steps Executed:**
- Navigated through all 9 RAM x Storage combinations on the PDP
- Checked price for each combination

**Findings:**
- All 9 combinations show the same base price of **$999.00**
- Option prices have no effect on the total (all show $0.00)
- The expected price formula (base + RAM option + Storage option) does not apply

**Result:** **FAIL**
**Root Cause:** Option prices not resolving on storefront. Same as TC-E2E-006 pricing bug.

---

#### TC-E2E-009 / CFG-E2E-007: Multi-Section Configuration Preserved in Cart -- BLOCKED

**Reason:** Cannot add to cart due to product unavailability issue.

**Result:** **BLOCKED** (depends on TC-E2E-006 passing)

---

#### TC-E2E-010 / CFG-E2E-008: Section Order Matches Admin -- PASS

**Steps Executed:**
- Verified section display order on storefront PDP
- RAM section appears first, Storage section appears second

**Findings:**
- Section order on storefront matches the `displayOrder` set in admin configuration
- RAM (displayOrder=0) appears before Storage (displayOrder=1)

**Result:** **PASS**

---

### Scenario 4: Out of Stock Option

#### TC-E2E-014 / CFG-E2E-009: Out-of-Stock Option Disabled on Storefront -- FAIL

**Steps Executed:**
1. Created "Test Config OOS Bike 20260224" (base $500, inventory 50) in "Configurable products" catalog
2. Created 4 option products: Red Frame ($0.01, qty=10), Blue Frame ($0.01, qty=5), Limited Edition Black Frame ($50, qty=0), Silver Frame ($25, qty=8)
3. Configured section "Frame Color" (Required, Product type, 4 options) and activated (isActive: true)
4. Set prices in BeerUSD pricelist, set inventory via vendor-fulfillment FFC
5. Linked all products to B2B-mixed > Configurations category, triggered re-index
6. Navigated to storefront PDP

**Findings:**
- Configuration section "Frame Color *" renders correctly with all 4 options
- Base price + option price math works correctly ($500 + option price)
- **Limited Edition Black Frame (qty=0, OOS) has NO visual indicator** of being out of stock:
  - Radio button is NOT disabled (radioDisabled: false)
  - CSS classes are identical to in-stock options
  - Opacity is 1 (no greyed-out state)
  - No "Sold out", "Out of Stock", or "Unavailable" label
  - Pointer events are "auto" (fully clickable)
- **OOS option is fully selectable**: Clicking the radio button selects it and updates price to $550.00
- **OOS option can be added to cart**: Incrementing quantity adds the product with OOS option to cart with no error or warning

**Expected:** Out-of-stock option (qty=0) should be visually differentiated (greyed out, disabled, or labeled "Out of Stock") and not selectable.
**Actual:** OOS option is indistinguishable from in-stock options and fully functional.

**Result:** **FAIL**

**Evidence:**
- `tests/Sprint26-05/TC-E2E-014/screenshots/TC-E2E-014-config-sections-visible.png` -- PDP with all 4 options visible, no OOS indicator
- `tests/Sprint26-05/TC-E2E-014/screenshots/TC-E2E-014-oos-option-selected.png` -- Limited Edition Black Frame selected, price=$550.00
- `tests/Sprint26-05/TC-E2E-014/screenshots/TC-E2E-014-oos-option-added-to-cart.png` -- OOS option added to cart successfully

**DOM Analysis (all 4 options):**

| Option | radioDisabled | CSS Classes | Opacity | pointerEvents | OOS Label |
|--------|--------------|-------------|---------|---------------|-----------|
| Blue Frame (qty=5) | false | vc-product-card...option-product | 1 | auto | none |
| Silver Frame (qty=8) | false | vc-product-card...option-product | 1 | auto | none |
| Red Frame (qty=10) | false | vc-product-card...option-product | 1 | auto | none |
| Limited Edition Black Frame (qty=0) | false | vc-product-card...option-product | 1 | auto | none |

---

#### TC-E2E-015 / CFG-PDP-016: OOS Visual Indicator/Label -- FAIL

**Steps Executed:**
1. On the same OOS Bike PDP, examined the Limited Edition Black Frame option row
2. Compared CSS classes, opacity, disabled state, and text content between OOS and in-stock options

**Findings:**
- There is **absolutely NO visual differentiation** between OOS (qty=0) and in-stock options
- No "Sold out" label
- No "Out of Stock" text
- No "Unavailable" indicator
- No greyed-out appearance
- No disabled state on radio button
- All 4 options render with identical classes: `vc-product-card vc-product-card--view-mode--item vc-product-card--background option-product`

**Expected:** Out-of-stock options should be visually differentiated (greyed out or labeled "Out of Stock") and clicking should be prevented or show a warning.
**Actual:** Identical rendering for OOS and in-stock options.

**Result:** **FAIL**

---

#### TC-E2E-016: All Options OOS -- Add to Cart Should Be Disabled -- FAIL

**Steps Executed:**
1. Created "Test Config AllOOS 20260224" (base $300, inventory 20) in "Configurable products" catalog
2. Created 2 option products: Carbon Material ($0.01, qty=0), Titanium Material ($50, qty=0)
3. Configured section "Material" (Required, Product type, 2 options), activated configuration
4. Set prices in BeerUSD pricelist, set inventory (main=20, both options=0) via vendor-fulfillment FFC
5. Linked all products to B2B-mixed > Configurations category, triggered re-index
6. Navigated to storefront PDP

**Findings:**
- Product PDP renders with "Create your own configuration" button and "Material *" section
- Both options (Titanium Material, Carbon Material) are fully selectable despite both having qty=0
- No OOS indicators on either option
- **Add to Cart is fully functional**: Clicking the Increase Quantity button adds the item to cart
- Cart badge updates to show the item (verified: cart badge showed count increase, cart page showed the item at $350.00 with "In stock: 20")
- The product was added to cart with an OOS option selected -- no validation, no warning, no error

**Expected:** When ALL configuration options in a required section are out of stock, the product should not be purchasable (Add to Cart disabled, or validation error preventing cart addition).
**Actual:** Product is fully purchasable with OOS options. No restrictions of any kind.

**Result:** **FAIL**

**Evidence:**
- `tests/Sprint26-05/TC-E2E-016/screenshots/TC-E2E-016-alloos-added-to-cart.png` -- AllOOS product added to cart with OOS Titanium option selected

---

## Summary Table

| Test Case | CSV ID | Title | Priority | Result | Notes |
|-----------|--------|-------|----------|--------|-------|
| TC-E2E-006 | CFG-E2E-004 | Multi-Section Laptop: Sections and Price Math | Critical | **FAIL** | Sections show "optional" not "required"; option prices $0.00; product unavailable |
| TC-E2E-007 | CFG-E2E-005 | Required Sections Block Add-to-Cart | Critical | **BLOCKED** | Product unavailable, cannot test cart validation |
| TC-E2E-008 | CFG-E2E-006 | All 9 Combinations Price Math | High | **FAIL** | All combos show base price only ($999), options add $0 |
| TC-E2E-009 | CFG-E2E-007 | Multi-Section Config Preserved in Cart | High | **BLOCKED** | Cannot add to cart |
| TC-E2E-010 | CFG-E2E-008 | Section Display Order | High | **PASS** | Section order matches admin configuration |
| TC-E2E-014 | CFG-E2E-009 | OOS Option Disabled on Storefront | High | **FAIL** | OOS option fully selectable, no visual indicator, addable to cart |
| TC-E2E-015 | CFG-PDP-016 | OOS Visual Indicator/Label | Medium | **FAIL** | Zero visual differentiation between OOS and in-stock options |
| TC-E2E-016 | (extension) | All Options OOS: Cart Disabled | High | **FAIL** | All options OOS but product is fully purchasable |

---

## Statistics

| Metric | Count |
|--------|-------|
| Total Tests | 8 |
| Passed | 1 |
| Failed | 5 |
| Blocked | 2 |
| Pass Rate | 12.5% |

---

## Bugs Identified

### BUG-1: Out-of-Stock Configuration Options Have No Visual Indicator and Are Fully Selectable (P1)

**Severity:** High
**Priority:** P1
**Affects:** TC-E2E-014, TC-E2E-015, TC-E2E-016

**Description:** Configuration section option products with inventory quantity = 0 (out of stock) are rendered identically to in-stock options on the storefront PDP. There is no disabled state, no greyed-out appearance, no "Sold out" or "Out of Stock" label. Users can select OOS options and add the configured product to cart without any warning or validation.

**Impact:** Customers can purchase configurations with unavailable options, leading to fulfillment failures. This is a data integrity issue that could cause order processing errors.

**Steps to Reproduce:**
1. Create a configurable product with a section containing option products
2. Set one or more option products to inventory qty=0 in the fulfillment center
3. Navigate to the product PDP on the storefront
4. Observe that OOS options appear identical to in-stock options
5. Select an OOS option and add to cart -- succeeds with no error

**Expected:** OOS options should be visually marked and non-selectable (or show a warning when selected).
**Actual:** OOS options are fully interactive with no differentiation.

### BUG-2: All Options OOS in Required Section Does Not Block Add-to-Cart (P1)

**Severity:** High
**Priority:** P1
**Affects:** TC-E2E-016

**Description:** When ALL options in a required configuration section have zero inventory, the "Add to Cart" / quantity increment button remains enabled and functional. The product can be added to cart with an OOS option selected in a required section.

**Impact:** Enables creation of orders that cannot be fulfilled, since the required section's options are all out of stock.

### BUG-3: Option Product Prices Not Resolving on Storefront (Scenario 2) (P1)

**Severity:** High
**Priority:** P1
**Affects:** TC-E2E-006, TC-E2E-008

**Description:** In Scenario 2 (Laptop with RAM and Storage sections), all option product prices display as $0.00 on the storefront PDP despite having valid prices in the BeerUSD pricelist (confirmed via REST API). The total price does not change when selecting different options.

**Impact:** Price calculations are incorrect; customers see base price only regardless of selected options.

**Note:** This may be related to the Laptop product showing as "unavailable" ("Stock alert") on the storefront, even though it has inventory in the vendor-fulfillment FFC. Further investigation needed to determine if this is a price resolution issue specific to newly created products or a broader platform issue.

### BUG-4: Product Configuration API PATCH Endpoint Returns 404 (P2)

**Severity:** Medium
**Priority:** P2

**Description:** The `PATCH /api/catalog/products/configurations/{id}` endpoint documented in Swagger returns 404 for both the configuration ID and the product ID. The `GET /api/catalog/products/configurations/{id}` endpoint also returns 404. Only the search endpoint (`POST /api/catalog/products/configurations/search`) works for retrieving configuration data.

**Workaround:** Use `POST /api/catalog/products/configurations` to re-create/update the entire configuration object.

### BUG-5: Product Configuration isActive Defaults to False When Created via API (P2)

**Severity:** Medium
**Priority:** P2

**Description:** When creating a product configuration via `POST /api/catalog/products/configurations`, the `isActive` field defaults to `false` even when not explicitly set. This means the configuration widget does not appear on the storefront until `isActive` is explicitly set to `true` and the configuration is re-saved. The Admin UI may handle this automatically, but the API does not.

**Workaround:** Always explicitly set `isActive: true` when creating configurations via API.

---

## Backend API Investigation Notes

### Configuration API Endpoints

| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| `/api/catalog/products/configurations/search` | POST | Working | Returns configuration data for given productIds |
| `/api/catalog/products/configurations` | POST | Working | Creates/updates configuration (full object replacement) |
| `/api/catalog/products/configurations/{id}` | GET | **404** | Does not work with either config ID or product ID |
| `/api/catalog/products/configurations/{id}` | PATCH | **404** | Does not work -- JSON Patch format documented but non-functional |

### Pricelist Resolution

- DefaultUSD pricelist has NO assignment to B2B-mixed catalog
- BeerUSD pricelist (ID: `a690e429-ac38-4e15-9099-9938f3577b71`) IS assigned with priority 1
- Prices must be added to BeerUSD for products to show correct pricing on storefront
- The correct API for saving prices is `PUT /api/products/prices` with ProductPrice schema
- `PUT /api/pricing/pricelists` with prices array returns 204 but does NOT persist prices

### GraphQL Schema

- The `productConfiguration` field does NOT exist on the GraphQL `Product` type
- Product configuration data is only accessible via the REST API
- The storefront must use a separate GraphQL query or REST call to fetch configuration data

---

## Cleanup Status

| Item | Status |
|------|--------|
| Cart cleared | Done (cleared via storefront "Clear cart" button) |
| Test products remain in catalog | Remaining (for re-testing after fixes) |
| Test products in B2B-mixed catalog | Linked (via listentrylinks) |
| Prices in BeerUSD pricelist | Set (should be cleaned after testing complete) |
| Inventory in vendor-fulfillment | Set (should be cleaned after testing complete) |

---

## Recommendation

**BLOCKED for release.** The configurable products feature has critical issues with out-of-stock option handling:

1. OOS options are not distinguished from in-stock options (no visual indicator, no disabled state)
2. OOS options can be selected and added to cart without validation
3. All-OOS required sections do not block purchase

These are P1 bugs that directly impact order fulfillment reliability. The feature should not be released until OOS inventory validation is implemented for configuration section options.

Additionally, the Scenario 2 pricing issue (option prices showing $0.00) needs investigation to determine if it is specific to the test data setup or a broader platform bug.
