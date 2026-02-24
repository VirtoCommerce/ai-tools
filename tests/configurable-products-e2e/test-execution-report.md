# Configurable Products E2E Test Execution Report

## Test Information

| Field | Value |
|-------|-------|
| **Date** | 2026-02-24 |
| **Tester** | qa-frontend-expert (automated via Playwright MCP) |
| **Environment** | QA Storefront: https://vcst-qa-storefront.govirto.com |
| **Admin** | https://vcst-qa.govirto.com |
| **Store Version** | Ver. 2.42.0-alpha.2241 |
| **Browser** | Chromium (Playwright MCP - playwright-chrome) |
| **Viewport** | 1920x1080 (Desktop) |
| **Logged in as** | Coffee shop / Elena Mutykova |
| **Store** | B2B-store |

## Scope

Execution of configurable products E2E test cases covering:
- **Scenario 1** (TC-E2E-001 through TC-E2E-005): Single Radio Section -- Optional section with 5 radio options
- **Scenario 3** (TC-E2E-011 through TC-E2E-013): Sale Price vs List Price -- Strikethrough pricing on configuration options

**Test Product Used:** Bike with options (SKU: CVQ-54616437)
- PDP URL: `/products-with-options/configurations/build-the-bike-of-your-dreams/bike-with-options`
- Base price: $350.00
- Configuration section: "Select one" (optional, radio)
- Options:
  - Rear wheel, 26", double-wall rim, motorized -- Sale: $88.00 / List: $126.00 (strikethrough), qty 2
  - 200CC 250CC 4-Stroke Engine Motor -- $225.00, qty 1
  - Seat -- $15.00, qty 1
  - Pedals -- $14.00, qty 1
  - None (default selected)

**Non-configurable product used for TC-E2E-005:** Gold-Plated Silver Set with Cubic Zirconia Beads (SKU: WCY-17946926)
- PDP URL: `/jewelry-and-gems/beads/gold-plated-silver-set-with-cubic-zirconia`

---

## Results Summary

| Test Case | Title | Status | Notes |
|-----------|-------|--------|-------|
| TC-E2E-001 | Config widget renders with single optional radio section | PASS | All 5 options visible, None default, prices correct |
| TC-E2E-002 | Optional section allows add-to-cart with None selected | PASS | No validation error, cart shows $350.00 base price |
| TC-E2E-003 | Selected upgrade option reflected in cart | PASS | Engine Motor: cart shows $575.00 ($350+$225), components list correct |
| TC-E2E-004 | Widget renders correctly after page refresh | PASS | All options persist after location.reload() |
| TC-E2E-005 | Non-configurable product has no config widget | PASS | Gold-Plated Silver Set PDP has no "Configure the parameters" section |
| TC-E2E-011 | Sale price with strikethrough list price on config option | PASS | Rear wheel: $88.00 sale / $126.00 strikethrough list |
| TC-E2E-012 | Sale price takes precedence over list price | PASS | Sale price displayed prominently; list price secondary with strikethrough |
| TC-E2E-013 | Sale price reflected correctly in cart total | PASS | Cart: $526.00 sale / $602.00 list; Discount -$76.00; Total $631.20 |

**Overall Result: 8/8 PASS**

---

## Detailed Test Execution

### TC-E2E-001: Config Widget Renders with Single Optional Radio Section

**Maps to CSV:** CFG-E2E-001 (adapted -- using existing "Bike with options" product)

**Steps Executed:**
1. Navigated to `https://vcst-qa-storefront.govirto.com/products-with-options/configurations/build-the-bike-of-your-dreams/bike-with-options`
2. Waited for "Configure the parameters" text to appear
3. Verified product name "Bike with options" and base price $350.00
4. Verified "CONFIGURE THE PARAMETERS" widget header visible
5. Verified accordion section "SELECT ONE" with subtitle "Personalize your selection further (optional)"
6. Verified 5 radio options:
   - Rear wheel, 26", double-wall rim, motorized -- $88.00 (sale) / $126.00 (list strikethrough), qty 2, extended $176.00
   - 200CC 250CC 4-Stroke Engine Motor -- $225.00, qty 1, extended $225.00
   - Seat -- $15.00, qty 1, extended $15.00
   - Pedals -- $14.00, qty 1, extended $14.00
   - None (default selected, no price)
7. Confirmed None radio is checked by default
8. Confirmed quantity stepper at 0, "In stock 7567"

**Result: PASS**

**Screenshots:**
- `screenshots/TC-E2E-001-config-widget-overview.png`
- `screenshots/TC-E2E-001-config-widget-radio-options.png`
- `screenshots/TC-E2E-001-all-radio-options-with-none.png`

---

### TC-E2E-002: Optional Section Allows Add-to-Cart with None Selected

**Maps to CSV:** CFG-E2E-002

**Steps Executed:**
1. On Bike with options PDP, confirmed None is selected by default
2. Clicked "+" to set quantity to 1
3. Clicked "Add to Cart" (via Increase quantity button)
4. Verified cart badge updated to "1" in header
5. No validation error displayed -- optional section does not block add-to-cart
6. Navigated to cart page
7. Verified cart line item:
   - Product: "Bike with options"
   - Price per item: $350.00
   - Total: $350.00
   - Subtotal: $350.00
   - Tax: $70.00
   - Order Total: $420.00
8. "Components list" button visible (expandable)

**Result: PASS**

**Screenshots:**
- `screenshots/TC-E2E-002-add-to-cart-none-selected.png`
- `screenshots/TC-E2E-002-cart-none-selected-350.png`

---

### TC-E2E-003: Selected Upgrade Option Reflected in Cart

**Maps to CSV:** CFG-E2E-003

**Steps Executed:**
1. Removed item from cart (to start clean)
2. Navigated back to Bike with options PDP
3. Selected "200CC 250CC 4-Stroke Engine Motor" radio button
4. Verified PDP price updated to $575.00 ($350 base + $225 engine motor)
5. Added 1 item to cart
6. Navigated to cart page
7. Verified cart line item:
   - Price per item: $575.00
   - Total: $575.00
   - Subtotal: $575.00
8. Expanded "Components list" -- confirmed:
   - "1. 200CC 250CC 4-Stroke Engine Motor..." visible
   - "Edit configuration" link present with correct URL including lineItemId

**Result: PASS**

**Screenshots:**
- `screenshots/TC-E2E-003-engine-motor-selected-575.png`
- `screenshots/TC-E2E-003-cart-engine-motor-575.png`
- `screenshots/TC-E2E-003-cart-components-list-expanded.png`

---

### TC-E2E-004: Widget Renders Correctly After Page Refresh

**Maps to CSV:** CFG-PDP-001 (widget persistence subset)

**Steps Executed:**
1. Removed item from cart
2. Navigated to Bike with options PDP
3. Executed `location.reload()` via browser_evaluate
4. Waited for "Configure the parameters" text to reappear
5. Took snapshot and verified:
   - All 5 radio options rendered correctly
   - None is selected by default
   - All prices display correctly (Rear wheel $88/$126, Engine $225, Seat $15, Pedals $14)
   - Quantity stepper at 0
   - "In stock 7567" badge visible
6. No JavaScript errors related to configuration widget

**Result: PASS**

**Screenshots:**
- `screenshots/TC-E2E-004-widget-after-refresh.png`

---

### TC-E2E-005: Non-Configurable Product Has No Configuration Widget

**Maps to CSV:** CFG-E2E-016 (conceptual equivalent -- product without configuration)

**Steps Executed:**
1. Navigated to Gold-Plated Silver Set with Cubic Zirconia Beads PDP at `/jewelry-and-gems/beads/gold-plated-silver-set-with-cubic-zirconia`
2. Page loaded with standard PDP elements:
   - Heading: "Gold-Plated Silver Set with Cubic Zirconia Beads"
   - SKU: #WCY-17946926
   - Rating: 4/5
   - Description section
   - Feedback section with review
   - Price: $330.00
   - Quantity selector
   - In stock: 4844
   - Shipment options
   - "Customers bought together" section
3. Verified NO "Configure the parameters" section exists
4. Verified NO radiogroup elements on the page
5. Verified NO configuration widget of any kind
6. Product behaves as standard non-configurable product

**Result: PASS**

**Screenshots:**
- `screenshots/TC-E2E-005-non-configurable-pdp.png` (full page)

---

### TC-E2E-011: Sale Price with Strikethrough List Price on Configuration Option

**Maps to CSV:** CFG-E2E-008 (adapted -- using existing Rear wheel option with sale pricing)

**Steps Executed:**
1. Navigated to Bike with options PDP
2. Waited for configuration widget to load
3. Located "Rear wheel, 26", double-wall rim, motorized" option row
4. Verified price display:
   - **Sale price: $88.00** -- displayed prominently in bold, larger text
   - **List price: $126.00** -- displayed below in smaller text with strikethrough formatting
   - Quantity: 2
   - Extended price: $176.00 ($88.00 x 2)
5. Verified all other options show single price only (no sale/list split):
   - Engine Motor: $225.00
   - Seat: $15.00
   - Pedals: $14.00
   - None: no price

**Result: PASS**

**Screenshots:**
- `screenshots/TC-E2E-011-sale-price-strikethrough.png` (Rear wheel option close-up)
- `screenshots/TC-E2E-011-full-config-section-with-sale-price.png` (all options showing pricing contrast)

---

### TC-E2E-012: Sale Price Takes Precedence Over List Price

**Maps to CSV:** CFG-PDP-004

**Steps Executed:**
1. On Bike with options PDP, examined price display hierarchy
2. Verified visual precedence for Rear wheel option:
   - Sale price ($88.00) is displayed as the PRIMARY price -- larger font, bold, prominent position
   - List price ($126.00) is displayed as SECONDARY -- smaller font, strikethrough, positioned below
3. Clicked the Rear wheel radio button to select it
4. Verified PDP sidebar price update:
   - **Sale price (active): $526.00** = $350 base + ($88 sale x 2) = $350 + $176
   - **List price (strikethrough): $602.00** = $350 base + ($126 list x 2) = $350 + $252
5. Confirmed the sale price is used for the active/actionable total, not the list price

**Price Math Verification:**
- Base: $350.00
- Rear wheel sale price: $88.00 x 2 = $176.00
- Rear wheel list price: $126.00 x 2 = $252.00
- Total using sale: $350 + $176 = $526.00 (correct, matches display)
- Total using list: $350 + $252 = $602.00 (correct, shown as strikethrough)

**Result: PASS**

**Screenshots:**
- `screenshots/TC-E2E-013-pdp-price-with-rear-wheel-sale.png` (PDP sidebar showing $526/$602)

---

### TC-E2E-013: Sale Price Reflected Correctly in Cart Total

**Maps to CSV:** CFG-E2E-008 (cart verification portion)

**Steps Executed:**
1. With Rear wheel selected on PDP (price showing $526.00 sale / $602.00 list)
2. Clicked "+" to set quantity to 1
3. Clicked Add to Cart -- cart badge updated to "1"
4. Navigated to cart page
5. Verified cart line item:
   - Product: "Bike with options"
   - **Price per item: $526.00** (sale price, bold)
   - **List price: $602.00** (strikethrough, below sale price)
   - Quantity: 1
   - **Line total: $526.00**
6. Verified Order Summary sidebar:
   - **Subtotal: $602.00** (list price basis)
   - **Discount: - $76.00** (difference: $602 - $526 = $76, representing the sale savings)
   - **Tax: + $105.20** (20% of $526.00 = $105.20)
   - **Shipping cost: $0.00**
   - **Total: $631.20** ($526.00 + $105.20)
7. Expanded Components list:
   - "1. Rear wheel, 26", double-wall rim, motorized" confirmed
   - "Edit configuration" link available

**Price Math Verification:**
- Cart applies sale price correctly: $526.00 (not $602.00 list)
- Discount line shows the sale savings: $602.00 - $526.00 = $76.00
- Tax calculated on sale price: $526.00 x 20% = $105.20
- Final total: $526.00 + $105.20 = $631.20

**Result: PASS**

**Screenshots:**
- `screenshots/TC-E2E-013-cart-line-item-sale-price.png` (cart line showing $526/$602)
- `screenshots/TC-E2E-013-order-summary-sale-discount.png` (order summary with discount breakdown)
- `screenshots/TC-E2E-013-components-list-rear-wheel.png` (expanded components list)

---

## Screenshot Inventory

All screenshots saved to: `tests/configurable-products-e2e/screenshots/`

| # | Filename | Description |
|---|----------|-------------|
| 1 | `TC-E2E-001-config-widget-overview.png` | PDP top with "CONFIGURE THE PARAMETERS" heading |
| 2 | `TC-E2E-001-config-widget-radio-options.png` | First 3 radio options in the configuration section |
| 3 | `TC-E2E-001-all-radio-options-with-none.png` | All 5 options including None (default checked) |
| 4 | `TC-E2E-002-add-to-cart-none-selected.png` | PDP with qty=1, price=$350, cart badge=1 |
| 5 | `TC-E2E-002-cart-none-selected-350.png` | Cart: $350 price, $70 tax, $420 total |
| 6 | `TC-E2E-003-engine-motor-selected-575.png` | PDP with Engine Motor selected, price=$575 |
| 7 | `TC-E2E-003-cart-engine-motor-575.png` | Cart: $575 price, $115 tax, $690 total |
| 8 | `TC-E2E-003-cart-components-list-expanded.png` | Cart with Components list expanded showing Engine Motor |
| 9 | `TC-E2E-004-widget-after-refresh.png` | PDP after page reload, widget intact |
| 10 | `TC-E2E-005-non-configurable-pdp.png` | Non-configurable product (Gold-Plated Silver Set) full page |
| 11 | `TC-E2E-011-sale-price-strikethrough.png` | Rear wheel option: $88 sale / $126 strikethrough |
| 12 | `TC-E2E-011-full-config-section-with-sale-price.png` | Full config section showing all options with pricing |
| 13 | `TC-E2E-013-pdp-price-with-rear-wheel-sale.png` | PDP sidebar: $526 sale / $602 strikethrough |
| 14 | `TC-E2E-013-cart-line-item-sale-price.png` | Cart line: $526 sale / $602 strikethrough |
| 15 | `TC-E2E-013-order-summary-sale-discount.png` | Order summary: subtotal $602, discount -$76, total $631.20 |
| 16 | `TC-E2E-013-components-list-rear-wheel.png` | Components list showing Rear wheel component |

---

## Observations and Notes

### Sale Price Implementation in Cart
The cart displays sale pricing using a **discount-based approach** rather than directly showing the sale price as the subtotal:
- **Subtotal** shows the list price total ($602.00)
- **Discount** line shows the sale reduction (- $76.00)
- **Tax** is calculated on the effective (sale) price ($526.00 x 20% = $105.20)
- **Total** reflects the actual amount the customer pays ($631.20)

This is a valid approach that transparently shows customers how much they are saving.

### Console Errors Observed
- `Failed to load resource: the server responded with a status of 404` for some product image files (e.g., `apart-ap93-0341--0_md.jpg`, `475635_25ym_honda_crf450rx_1__md.jpg`). These are broken product image URLs unrelated to configurable product functionality.

### No Bugs Found
All 8 test cases passed without issues. The configurable products feature works correctly for:
- Widget rendering and option display
- Radio button selection and price calculation
- Optional section behavior (add to cart with None)
- Sale price vs list price visual hierarchy
- Cart integration with sale price discount calculation
- Component list display in cart
- Widget persistence across page refresh
- Non-configurable product exclusion

---

## Mapping to Regression Suite CSV (36-configurable-products-tests.csv)

| E2E Test Case | Regression CSV ID | Coverage |
|---------------|-------------------|----------|
| TC-E2E-001 | CFG-PDP-001, CFG-PDP-003 | Widget render, option display, price per row |
| TC-E2E-002 | CFG-E2E-002, CFG-PDP-007 | Optional section, None add-to-cart |
| TC-E2E-003 | CFG-E2E-003, CFG-PDP-011 | Cart with option selected, components list |
| TC-E2E-004 | CFG-PDP-001 (refresh) | Widget persistence after reload |
| TC-E2E-005 | CFG-E2E-016 (concept) | No widget on non-configurable product |
| TC-E2E-011 | CFG-PDP-004, CFG-E2E-008 | Sale price strikethrough display |
| TC-E2E-012 | CFG-PDP-004 | Sale price visual precedence |
| TC-E2E-013 | CFG-E2E-008 (cart) | Sale price in cart total with discount |
