# VCST-4765: Frontend Test Execution Report

**Date:** 2026-03-12
**Environment:** https://vcst-qa-storefront.govirto.com (QA)
**Platform Version:** 2.44.0-pr-2198-6327-6327c148
**Browser:** Chromium (playwright-chrome)
**Tester:** qa-frontend-expert (automated)
**Ticket:** VCST-4765 — [Contribution] Extend ConfigurationItem with pricing, checkout selection, and LineItemId

---

## Executive Summary

**Results:** 3 passed, 1 blocked, 3 not testable / 7 total scenarios -- **43% pass rate (of testable)**
**Decision:** BLOCKED -- Primary test product "Bike with options" does not exist in QA environment. Core configurable product functionality verified with existing "Configurable Hat" product. The new Variation section type cannot be validated.

---

## Blocker: Test Product Not Deployed

The ticket specifies testing "Bike with options" at URL:
```
/products-with-options/configurations/build-the-bike-of-your-dreams/bike-with-options
```

**Findings:**
- Direct navigation to the URL returns **404 Page not found**
- Search for "bike with options" returns **no results**
- Search for "bike" returns 71 results (all simple physical products -- phone holders, bike parts)
- The `/products-with-options/configurations` subcategory **exists** but shows **0 products**
- The "Configurations" category appears to be created but no products have been assigned to it

**Impact:** Cannot test the specific pricing scenarios (ListPrice strikethrough, Rear wheel at $88/$126, total price calculations with 5 options at specific prices). Cannot test the new **Variation** configuration section type introduced by VCST-4765.

---

## Test Results

### TC-1: Configurable Product PDP -- Pricing Display -- PARTIAL PASS

**Product tested:** Configurable Hat ($15.00 base, SKU #YER-80407217)
**URL:** `/products-with-options/configurable-caps-shirts/configurable-hat`

**Verified:**
- PDP loads correctly with product name, SKU, image, price, stock (4560)
- "CREATE YOUR OWN CONFIGURATION" button visible
- "CONFIGURE THE PARAMETERS" section renders with 4 configuration sections:
  1. "Select your fav color" (Product type, optional) -- 4 options + None
  2. "Select print-ready cap" (Product type, optional)
  3. "Customize text for your cap" (Text type, optional)
  4. "Add photo" (File type, optional)
- Configuration options display salePrice and extended price correctly:
  - Black hat: $10.00, qty=1, extended=$10.00
  - Beige hat: $500.00, qty=1, extended=$500.00
  - Green hat: $18.00, qty=1, extended=$18.00
  - Red hat: $14.00, qty=1, extended=$14.00
- "None" option available for optional sections
- Price recalculates correctly when selecting options:
  - None selected: $15.00 (base only)
  - Black hat selected: $25.00 ($15 + $10) -- CORRECT
  - Red hat selected: $29.00 ($15 + $14) -- CORRECT

**Not verified (VCST-4765 specific):**
- ListPrice with strikethrough display (no existing products have distinct listPrice vs salePrice in configuration options)
- Variation section type (new in VCST-4765 -- no test products available)
- The specific Rear wheel option pricing (qty=2, salePrice $88, listPrice $126, extended=$176)

**Observation:** Quantity spinbuttons on configuration options are all `disabled`. Users cannot change the quantity of individual configuration options on this product. This may be by design (qty set in admin).

### TC-2: Add Configured Product to Cart -- PASS

**Steps:**
1. Selected "Black hat" option on Configurable Hat PDP
2. Price updated to $25.00 ($15 base + $10 option)
3. Clicked "Increase quantity" to set qty=1
4. Product added to cart successfully

**Verified in cart:**
- Product name: "Configurable Hat" with correct image
- Properties column: Color: Green/dark-forest, Size: 36, Fabric: Cotton (base product properties)
- Price per item: $25.00 -- CORRECT
- Quantity: 1
- Total: $25.00 -- CORRECT
- Stock: 4560
- "Components list" expandable section present, showing "1. Black hat"
- "Edit configuration" button present
- Cart count badge updated correctly

### TC-3: Edit Configuration in Cart -- PASS

**Steps:**
1. Clicked "Edit configuration" link on Configurable Hat cart line item
2. Redirected to PDP with `?lineItemId=5329dc66-81f2-47d4-b387-a99c74be8a19`
3. PDP loaded with existing configuration pre-selected (Black hat checked, price $25.00)
4. Changed selection from Black hat to Red hat
5. Price updated to $29.00 ($15 + $14) -- CORRECT
6. Notification appeared: "The product configuration has been changed. You can always save it later by clicking 'Update cart' button."
7. Clicked "Save" button
8. Navigated back to cart

**Verified after edit:**
- Cart line item price updated: $29.00 (was $25.00) -- CORRECT
- Total updated: $29.00 -- CORRECT
- Order Summary subtotal recalculated (increased by $4.00) -- CORRECT

**Key finding for VCST-4765:** The `lineItemId` query parameter is actively used in the "Edit configuration" flow. The URL format is:
```
/products-with-options/configurable-caps-shirts/configurable-hat?lineItemId={uuid}
```
This confirms the LineItemId feature from the ticket is integrated into the storefront.

### TC-4: Checkout Flow with Configured Product -- BLOCKED

**Reason:** The current organization context ("[E2E Test] Contoso Ltd.") shows "Complete all required information to proceed" warning on the cart page. No shipping address is configured for this org. Additionally, the cart contains 72+ items from various test sessions, making a clean checkout test impractical without a dedicated test setup.

### TC-5: Order History Verification -- NOT TESTABLE

**Reason:** Depends on TC-4 (checkout completion).

### TC-6: Multiple Configurable Products in Cart -- NOT TESTABLE

**Reason:** Would require adding a second configured product. The "Bike with options" product (which would provide a different configurable product) is not available. Testing with the same product in a different configuration would require removing the existing one first.

### TC-7: Required vs Optional Sections -- PASS

**Verified on Configurable Hat:**
- All 4 sections are marked "(optional)" in the UI
- "None" option is available and pre-selected by default on all sections
- Product can be added to cart with "None" selected on all optional sections (base price $15.00 only)
- No "Add to Cart" blocking behavior when optional sections have "None" selected

**Not tested:** Required sections (isRequired=true) -- would need a product with required configuration sections (e.g., "Hoodie Base (File required)" at `/products-with-options/configurable-caps-shirts/physical-1703`).

---

## Business Rules Verification

| Rule | Status | Notes |
|------|--------|-------|
| BL-PRICE-003: Price rounding to 2 decimals | PASS | All prices display with exactly 2 decimal places ($15.00, $25.00, $29.00, $10.00, etc.) |
| BL-CAT-006: Required sections must be filled | PARTIAL | Only optional sections tested. Required section blocking not verified. |
| BL-CART-007: Different configs create separate lines | NOT TESTED | Only one configured product tested |

---

## Console & Network Summary

**Console errors:**
- `404` for `/cms-content/assets/catalog/a57c0/EFT-72543359/Images/skinny_md.png` -- unrelated asset, pre-existing issue
- `404` for external image `s1.apart.pl/products/jewellery/packshot/73065/apart-189-353--0_sm.jpg` -- unrelated product image
- No JavaScript errors, no Vue hydration warnings, no GraphQL errors

**Network:**
- All GraphQL requests returned HTTP 200
- No 4xx/5xx on storefront API calls
- GA4 events firing correctly (page_view, view_item_list, remove_from_cart events observed)

---

## VCST-4765 Specific Features -- Assessment

| Feature | Storefront Evidence | Status |
|---------|-------------------|--------|
| **ListPrice on ConfigurationItem** | Not visible on existing products (no strikethrough pricing on config options) | CANNOT VERIFY -- needs test data with distinct list/sale prices |
| **SalePrice on ConfigurationItem** | Visible and working on Configurable Hat options ($10, $500, $18, $14) | PASS |
| **ExtendedPrice on ConfigurationItem** | Visible and working (salePrice x qty displayed for each option) | PASS |
| **SelectedForCheckout flag** | Cart shows configuration persisted; checkbox on cart line items works | PARTIAL -- no checkout completed |
| **LineItemId** | Actively used in "Edit configuration" URL (`?lineItemId={uuid}`) | PASS |
| **Variation section type** | Not present in any existing products; "Configurations" category is empty | CANNOT VERIFY -- needs "Bike with options" product |

---

## Recommendations

1. **CRITICAL:** Seed the "Bike with options" test product into the QA environment at the expected URL path (`/products-with-options/configurations/build-the-bike-of-your-dreams/bike-with-options`) with:
   - Base price $350
   - 5 configuration options: None, Seat ($15), Pedals ($14), Engine ($225), Rear wheel ($88 sale / $126 list, qty=2)
   - At least one Variation section type (the new type added by VCST-4765)
   - At least one required section

2. **RE-TEST NEEDED** after test data is seeded:
   - ListPrice with strikethrough display
   - Variation section type rendering
   - Total price calculations with the specific 5-option pricing matrix
   - Checkout flow with configured product
   - Order history verification

3. **Minor observation:** The "Configurations" subcategory under "Products with options" exists but is empty. Either assign products to it or remove it to avoid a confusing empty category page.

---

## Evidence

| File | Description |
|------|-------------|
| `screenshots/configurable-hat-pdp-blank.png` | Configurable Hat PDP with configuration sections visible |
| `screenshots/cart-with-configurable-hat.png` | Cart showing Configurable Hat with Components list |
| `screenshots/cart-after-components-click.png` | Cart with Components list expanded showing "1. Black hat" and Edit configuration button |
| `screenshots/edit-configuration-pdp.png` | PDP in edit mode via lineItemId parameter, showing pre-selected configuration |
| `screenshots/cart-after-edit-configuration.png` | Cart after editing configuration from Black hat to Red hat, price updated to $29.00 |

---

## Sign-Off

**Feature:** VCST-4765 ConfigurationItem Extension
**Ticket:** VCST-4765
**Environment:** QA (https://vcst-qa-storefront.govirto.com)

| Area | Status | Issues |
|------|--------|--------|
| PDP Configuration Display | PASS | 0 |
| Configuration Pricing | PASS | 0 (existing products only) |
| ListPrice Strikethrough | BLOCKED | Test data missing |
| Variation Section Type | BLOCKED | Test data missing |
| Add to Cart | PASS | 0 |
| Edit Configuration (LineItemId) | PASS | 0 |
| Checkout Flow | BLOCKED | No shipping address + test data |
| Order History | BLOCKED | Depends on checkout |

**Bugs:** 0 filed
**Decision:** BLOCKED -- Re-test required after "Bike with options" product is deployed to QA
**Blocking:** Missing test product ("Bike with options") in QA environment
**Full report:** `tests/Sprint-current/VCST-4765/frontend-test-report.md`
