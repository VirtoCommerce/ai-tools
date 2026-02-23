# Configurable Products — End-to-End Test Cases

**Feature:** Configurable Products (Admin Creation → Frontend Verification)
**Scope:** True E2E round-trip tests: create/edit/delete in Admin SPA, verify on Storefront
**Total Test Cases:** 27
**Admin URL:** `${BACK_URL}`
**Storefront URL:** `${FRONT_URL}`
**Admin Credentials:** `${ADMIN}` / `${ADMIN_PASSWORD}`
**Last Updated:** 2026-02-23

---

## Scenarios Overview

| # | Scenario | Priority | Test Cases |
|---|----------|----------|------------|
| 1 | Single Radio Section — Create and verify 4-option product | P0 | TC-E2E-001 to TC-E2E-005 |
| 2 | Multiple Sections — Two required radio sections with price math | P0 | TC-E2E-006 to TC-E2E-010 |
| 3 | Sale Price vs List Price — Strikethrough pricing on frontend | P1 | TC-E2E-011 to TC-E2E-013 |
| 4 | Out of Stock Option — Disabled/blocked options on frontend | P1 | TC-E2E-014 to TC-E2E-016 |
| 5 | Complete E2E with Checkout — Cart, checkout, order history | P0 | TC-E2E-017 to TC-E2E-020 |
| 6 | Admin Edit Option Price — Price change reflects on frontend | P1 | TC-E2E-021 to TC-E2E-023 |
| 7 | Admin Delete Option — Deleted option disappears from frontend | P1 | TC-E2E-024 to TC-E2E-027 |

---

## Scenario 1: Single Radio Section

### TC-E2E-001: Create configurable bike product with single optional radio section

**Priority:** Critical
**Type:** End-to-End Functional
**Estimate:** 15 min
**Section:** Scenario 1 — Single Radio Section

**Preconditions:**
- Admin is logged in at `${BACK_URL}` with credentials `${ADMIN}` / `${ADMIN_PASSWORD}`
- Catalog module is active and accessible
- At least one published store and category exist
- Storefront is accessible at `${FRONT_URL}`
- Date suffix available to create unique product name (e.g., current date YYYYMMDD)

**ADMIN STEPS:**

1. Navigate to `${BACK_URL}` and log in as `${ADMIN}` with password `${ADMIN_PASSWORD}`.
2. Go to Catalog → Products and click "Add" to create a new product.
3. Enter product name: `Test Config Bike [YYYYMMDD]` (replace YYYYMMDD with today's date).
4. Set product code/SKU: `BIKE-CFG-[YYYYMMDD]`.
5. Assign the product to an appropriate category (e.g., Bikes or root catalog).
6. Set the base product List Price to `200.00` USD.
7. Set total inventory quantity to `20`.
8. Navigate to the "Configurable" or "Configuration" tab/section for the product.
9. Click "Add Section" to create a new configuration section.
10. Set section name: `Choose Upgrade`.
11. Set section type to `Radio` (single select / one option at a time).
12. Set section as **Optional** (not required).
13. Click "Add Option" within the "Choose Upgrade" section.
14. Add option: Name = `None`, Price = `0.00`, Quantity = `20`. Save.
15. Click "Add Option" again. Add option: Name = `Basic Seat`, Price = `15.00`, Quantity = `10`. Save.
16. Click "Add Option" again. Add option: Name = `Premium Seat`, Price = `45.00`, Quantity = `5`. Save.
17. Click "Add Option" again. Add option: Name = `Racing Seat`, Price = `95.00`, Quantity = `2`. Save.
18. Confirm the section shows all 4 options: None, Basic Seat, Premium Seat, Racing Seat.
19. Set product status to **Active/Published**.
20. Save the product. Note the product URL slug or ID for frontend navigation.

**FRONTEND VERIFICATION STEPS:**

21. Navigate to `${FRONT_URL}` and search for `Test Config Bike [YYYYMMDD]` or navigate directly to the product URL.
22. Confirm the Product Detail Page (PDP) loads successfully and displays the correct product name.
23. Verify the "Configure the parameters" widget (configuration widget) is visible on the PDP.
24. Verify the section label "Choose Upgrade" is displayed within the widget.
25. Verify all 4 options are shown as radio buttons: None, Basic Seat, Premium Seat, Racing Seat.
26. Verify "None" is selected by default (since section is optional with a $0 option).
27. Verify the displayed price is `$200.00` when "None" is selected (base price + $0).
28. Click the "Basic Seat" radio button. Verify the displayed price updates to `$215.00` ($200 + $15).
29. Click the "Premium Seat" radio button. Verify the displayed price updates to `$245.00` ($200 + $45).
30. Click the "Racing Seat" radio button. Verify the displayed price updates to `$295.00` ($200 + $95).
31. Return selection to "None". Verify price returns to `$200.00`.

**Expected Result:**
- Product is created in Admin with exactly 4 options under one optional radio section.
- Storefront shows the "Configure the parameters" widget with section "Choose Upgrade".
- All 4 options are present and selectable as radio buttons.
- Price updates correctly with each selection: None=$200, Basic Seat=$215, Premium Seat=$245, Racing Seat=$295.
- Default selection is "None" with base price $200 displayed.

---

### TC-E2E-002: Verify optional section allows add-to-cart without selecting an upgrade

**Priority:** Critical
**Type:** End-to-End Functional
**Estimate:** 8 min
**Section:** Scenario 1 — Single Radio Section

**Preconditions:**
- TC-E2E-001 has been completed successfully.
- Product `Test Config Bike [YYYYMMDD]` is published and visible on `${FRONT_URL}`.
- User is on the PDP for `Test Config Bike [YYYYMMDD]`.

**ADMIN STEPS:**

1. (No admin steps required for this test — product already exists from TC-E2E-001.)

**FRONTEND VERIFICATION STEPS:**

2. Navigate to the PDP for `Test Config Bike [YYYYMMDD]` on `${FRONT_URL}`.
3. Confirm "Choose Upgrade" section is visible with "None" selected by default.
4. Do NOT change the selection — leave "None" selected.
5. Set quantity to `1`.
6. Click "Add to Cart" (or equivalent CTA button).
7. Verify cart adds the item successfully — no validation error is shown.
8. Open the cart and verify the item appears with name `Test Config Bike [YYYYMMDD]`.
9. Verify the cart line item price shows `$200.00`.
10. Verify the cart item shows the configuration selected: "Choose Upgrade: None" or similar indication.

**Expected Result:**
- Since the section is optional, the product can be added to cart with "None" selected.
- No blocking error prevents add-to-cart.
- Cart shows the product at base price $200.00 with "None" option noted.

---

### TC-E2E-003: Verify selected upgrade option is reflected in cart

**Priority:** Critical
**Type:** End-to-End Functional
**Estimate:** 8 min
**Section:** Scenario 1 — Single Radio Section

**Preconditions:**
- TC-E2E-001 has been completed successfully.
- Product `Test Config Bike [YYYYMMDD]` is published and visible on `${FRONT_URL}`.

**ADMIN STEPS:**

1. (No admin steps required — product already exists.)

**FRONTEND VERIFICATION STEPS:**

2. Navigate to the PDP for `Test Config Bike [YYYYMMDD]` on `${FRONT_URL}`.
3. In the "Choose Upgrade" section, click "Racing Seat".
4. Verify the displayed price updates to `$295.00`.
5. Set quantity to `1`.
6. Click "Add to Cart".
7. Verify cart adds the item successfully.
8. Open the cart and verify the item appears with name `Test Config Bike [YYYYMMDD]`.
9. Verify the cart line item price shows `$295.00`.
10. Verify the cart item shows the selected configuration: "Racing Seat" (or "Choose Upgrade: Racing Seat").

**Expected Result:**
- "Racing Seat" selection is preserved when adding to cart.
- Cart shows price of $295.00 reflecting the $95 option price added to $200 base.
- Configuration label/detail is shown in the cart line item.

---

### TC-E2E-004: Verify product configuration widget renders correctly after page refresh

**Priority:** High
**Type:** End-to-End Functional
**Estimate:** 5 min
**Section:** Scenario 1 — Single Radio Section

**Preconditions:**
- TC-E2E-001 has been completed successfully.
- Product `Test Config Bike [YYYYMMDD]` is published and visible on `${FRONT_URL}`.

**ADMIN STEPS:**

1. (No admin steps required.)

**FRONTEND VERIFICATION STEPS:**

2. Navigate to the PDP for `Test Config Bike [YYYYMMDD]` on `${FRONT_URL}`.
3. Confirm the configuration widget loads with all 4 options.
4. Select "Premium Seat". Verify price shows `$245.00`.
5. Reload the page (F5 or browser refresh).
6. Verify the configuration widget is still visible after reload.
7. Verify the section "Choose Upgrade" still shows all 4 options.
8. Verify the default selection resets to "None" after reload (or retains selection — note behavior either way).
9. Select "Basic Seat" again. Verify price shows `$215.00`.

**Expected Result:**
- Configuration widget loads correctly after page refresh.
- All options are still present and functional after reload.
- Price calculation works correctly after reload.

---

### TC-E2E-005: Verify configuration widget is not shown for a standard (non-configurable) product

**Priority:** High
**Type:** End-to-End Functional
**Estimate:** 5 min
**Section:** Scenario 1 — Single Radio Section

**Preconditions:**
- A standard (non-configurable) product exists in the catalog and is visible on `${FRONT_URL}`.
- Admin is logged in at `${BACK_URL}`.

**ADMIN STEPS:**

1. Navigate to `${BACK_URL}` and log in.
2. In Catalog → Products, find or create a simple product without any configuration sections.
3. Confirm the product has no sections/options defined under the configurable tab.
4. Confirm the product is published.

**FRONTEND VERIFICATION STEPS:**

5. Navigate to `${FRONT_URL}` and open the PDP for the standard (non-configurable) product.
6. Verify the page loads correctly.
7. Verify NO "Configure the parameters" widget is shown on the PDP.
8. Verify the "Add to Cart" button is visible and functional without any configuration required.

**Expected Result:**
- Standard products do not display the configuration widget.
- This confirms the widget only appears for products with at least one configuration section defined.

---

## Scenario 2: Multiple Sections

### TC-E2E-006: Create laptop product with two required radio sections

**Priority:** Critical
**Type:** End-to-End Functional
**Estimate:** 18 min
**Section:** Scenario 2 — Multiple Sections

**Preconditions:**
- Admin is logged in at `${BACK_URL}`.
- Catalog module is active.
- Storefront is accessible at `${FRONT_URL}`.

**ADMIN STEPS:**

1. Navigate to `${BACK_URL}` and log in as `${ADMIN}`.
2. Go to Catalog → Products → Add new product.
3. Enter product name: `Test Config Laptop [YYYYMMDD]`.
4. Set SKU: `LAPTOP-CFG-[YYYYMMDD]`.
5. Set base List Price to `999.00` USD.
6. Set inventory quantity to `50`.
7. Navigate to the configurable/configuration tab.
8. Click "Add Section". Set section name: `RAM`. Set type: `Radio`. Set as **Required**.
9. Add option under RAM: Name = `8GB`, Price = `0.00`, Quantity = `50`. Save.
10. Add option under RAM: Name = `16GB`, Price = `100.00`, Quantity = `30`. Save.
11. Add option under RAM: Name = `32GB`, Price = `250.00`, Quantity = `10`. Save.
12. Click "Add Section" again. Set section name: `Storage`. Set type: `Radio`. Set as **Required**.
13. Add option under Storage: Name = `256GB SSD`, Price = `0.00`, Quantity = `50`. Save.
14. Add option under Storage: Name = `512GB SSD`, Price = `75.00`, Quantity = `25`. Save.
15. Add option under Storage: Name = `1TB SSD`, Price = `150.00`, Quantity = `15`. Save.
16. Confirm two sections exist: RAM (3 options) and Storage (3 options), both Required.
17. Publish the product and save. Note the product slug/URL for frontend navigation.

**FRONTEND VERIFICATION STEPS:**

18. Navigate to `${FRONT_URL}` and open the PDP for `Test Config Laptop [YYYYMMDD]`.
19. Verify the "Configure the parameters" widget shows both sections: "RAM" and "Storage".
20. Verify RAM section has 3 radio options: 8GB, 16GB, 32GB.
21. Verify Storage section has 3 radio options: 256GB SSD, 512GB SSD, 1TB SSD.
22. Verify both sections are marked as required (e.g., asterisk or "required" label).
23. Verify the default price shown is `$999.00` (base price, no option pre-selected or lowest-priced options selected — note actual behavior).
24. Select RAM = `16GB`. Verify price updates to `$1,099.00` ($999 + $100).
25. Select Storage = `512GB SSD`. Verify price updates to `$1,174.00` ($999 + $100 + $75).
26. Change RAM to `32GB`. Verify price updates to `$1,324.00` ($999 + $250 + $75).
27. Change Storage to `1TB SSD`. Verify price updates to `$1,399.00` ($999 + $250 + $150).

**Expected Result:**
- Both required sections are visible on the frontend with all their options.
- Price math is correct for all combinations tested:
  - Base only: $999
  - 16GB + 512GB SSD: $1,174
  - 32GB + 512GB SSD: $1,324
  - 32GB + 1TB SSD: $1,399

---

### TC-E2E-007: Verify required sections block add-to-cart when unselected

**Priority:** Critical
**Type:** End-to-End Functional
**Estimate:** 8 min
**Section:** Scenario 2 — Multiple Sections

**Preconditions:**
- TC-E2E-006 has been completed successfully.
- Product `Test Config Laptop [YYYYMMDD]` is published and visible on `${FRONT_URL}`.

**ADMIN STEPS:**

1. (No admin steps required.)

**FRONTEND VERIFICATION STEPS:**

2. Navigate to the PDP for `Test Config Laptop [YYYYMMDD]` on `${FRONT_URL}`.
3. Do not select any option in the "RAM" section.
4. Do not select any option in the "Storage" section.
5. Click "Add to Cart" (or attempt to do so).
6. Verify that a validation error/message is shown preventing the item from being added to cart.
7. Verify the error message references the required sections (e.g., "Please configure required options" or highlights the unselected sections).
8. Now select RAM = `8GB` but leave Storage unselected.
9. Click "Add to Cart" again.
10. Verify the item still cannot be added — the Storage section is still unselected and required.
11. Select Storage = `256GB SSD`.
12. Click "Add to Cart" again.
13. Verify the item is now added to cart successfully.

**Expected Result:**
- Both required sections must be selected before the product can be added to cart.
- Appropriate validation messages are shown when required sections are incomplete.
- Product adds to cart successfully when both required sections have selections.

---

### TC-E2E-008: Verify price math for all section combinations matches admin-set prices

**Priority:** High
**Type:** End-to-End Functional
**Estimate:** 10 min
**Section:** Scenario 2 — Multiple Sections

**Preconditions:**
- TC-E2E-006 has been completed successfully.
- Product `Test Config Laptop [YYYYMMDD]` is visible on `${FRONT_URL}`.

**ADMIN STEPS:**

1. (No admin steps required — verify prices in admin for reference.)
2. Navigate to `${BACK_URL}` and open `Test Config Laptop [YYYYMMDD]`.
3. Confirm option prices: RAM 8GB=$0, 16GB=$100, 32GB=$250; Storage 256GB=$0, 512GB=$75, 1TB=$150.

**FRONTEND VERIFICATION STEPS:**

4. Navigate to the PDP for `Test Config Laptop [YYYYMMDD]` on `${FRONT_URL}`.
5. Select RAM = `8GB` and Storage = `256GB SSD`. Verify price = `$999.00`.
6. Select RAM = `8GB` and Storage = `512GB SSD`. Verify price = `$1,074.00` ($999 + $75).
7. Select RAM = `8GB` and Storage = `1TB SSD`. Verify price = `$1,149.00` ($999 + $150).
8. Select RAM = `16GB` and Storage = `256GB SSD`. Verify price = `$1,099.00` ($999 + $100).
9. Select RAM = `16GB` and Storage = `512GB SSD`. Verify price = `$1,174.00` ($999 + $100 + $75).
10. Select RAM = `16GB` and Storage = `1TB SSD`. Verify price = `$1,249.00` ($999 + $100 + $150).
11. Select RAM = `32GB` and Storage = `256GB SSD`. Verify price = `$1,249.00` ($999 + $250).
12. Select RAM = `32GB` and Storage = `512GB SSD`. Verify price = `$1,324.00` ($999 + $250 + $75).
13. Select RAM = `32GB` and Storage = `1TB SSD`. Verify price = `$1,399.00` ($999 + $250 + $150).

**Expected Result:**
- All 9 combinations show the correct calculated price.
- Price calculation follows: base price + RAM option price + Storage option price.
- No combination shows an incorrect total.

---

### TC-E2E-009: Verify multi-section configuration is preserved in cart

**Priority:** High
**Type:** End-to-End Functional
**Estimate:** 8 min
**Section:** Scenario 2 — Multiple Sections

**Preconditions:**
- TC-E2E-006 has been completed successfully.
- Product `Test Config Laptop [YYYYMMDD]` is visible on `${FRONT_URL}`.

**ADMIN STEPS:**

1. (No admin steps required.)

**FRONTEND VERIFICATION STEPS:**

2. Navigate to the PDP for `Test Config Laptop [YYYYMMDD]` on `${FRONT_URL}`.
3. Select RAM = `32GB` and Storage = `1TB SSD`.
4. Verify price shows `$1,399.00`.
5. Set quantity to `1`.
6. Click "Add to Cart".
7. Verify cart opens/updates with no error.
8. Navigate to the cart page.
9. Verify the laptop product appears in the cart.
10. Verify the cart price shows `$1,399.00`.
11. Verify the cart item shows both configuration selections: RAM = 32GB, Storage = 1TB SSD (or equivalent display).

**Expected Result:**
- Both selected options (RAM 32GB + 1TB SSD) are preserved and shown in cart.
- Price of $1,399.00 is correct in cart.
- Configuration details are visible in the cart line item.

---

### TC-E2E-010: Verify section order on frontend matches admin configuration order

**Priority:** Medium
**Type:** End-to-End Functional
**Estimate:** 5 min
**Section:** Scenario 2 — Multiple Sections

**Preconditions:**
- TC-E2E-006 has been completed successfully.
- Product `Test Config Laptop [YYYYMMDD]` is visible on `${FRONT_URL}`.

**ADMIN STEPS:**

1. Navigate to `${BACK_URL}` and open `Test Config Laptop [YYYYMMDD]`.
2. Confirm that in the admin configuration, "RAM" section appears before "Storage" section.
3. Note the exact order of sections as defined in admin.

**FRONTEND VERIFICATION STEPS:**

4. Navigate to the PDP for `Test Config Laptop [YYYYMMDD]` on `${FRONT_URL}`.
5. In the "Configure the parameters" widget, verify the first visible section is "RAM".
6. Verify the second visible section is "Storage".
7. Confirm the order matches the admin-defined order (RAM first, Storage second).

**Expected Result:**
- Sections appear in the same order on the frontend as configured in Admin.
- "RAM" appears before "Storage" in the configuration widget.

---

## Scenario 3: Sale Price vs List Price

### TC-E2E-011: Create configurable product with sale price option and verify strikethrough pricing

**Priority:** High
**Type:** End-to-End Functional
**Estimate:** 15 min
**Section:** Scenario 3 — Sale Price vs List Price

**Preconditions:**
- Admin is logged in at `${BACK_URL}`.
- Storefront is accessible at `${FRONT_URL}`.
- Storefront is configured to display both list price (crossed out) and sale price.

**ADMIN STEPS:**

1. Navigate to `${BACK_URL}` and log in as `${ADMIN}`.
2. Go to Catalog → Products → Add new product.
3. Enter product name: `Test Config Sale Bike [YYYYMMDD]`.
4. Set SKU: `BIKE-SALE-CFG-[YYYYMMDD]`.
5. Set base List Price to `300.00` USD and base Sale Price to `250.00` USD.
6. Set inventory to `30`.
7. Navigate to the configurable/configuration tab.
8. Add a section: Name = `Handlebars`, Type = `Radio`, Required = false (Optional).
9. Add option: Name = `Standard`, List Price = `50.00`, Sale Price = `40.00`, Quantity = `30`. Save.
10. Add option: Name = `Drop Bar`, List Price = `100.00`, Sale Price = `80.00`, Quantity = `20`. Save.
11. Add option: Name = `None`, List Price = `0.00`, Sale Price = `0.00`, Quantity = `30`. Save.
12. Publish the product and save.

**FRONTEND VERIFICATION STEPS:**

13. Navigate to `${FRONT_URL}` and open the PDP for `Test Config Sale Bike [YYYYMMDD]`.
14. Verify the base product shows: List price `$300.00` struck through, Sale price `$250.00` displayed prominently.
15. In the "Configure the parameters" widget, confirm the "Handlebars" section is visible.
16. With "None" selected (default), verify the price shows the base sale price `$250.00` (list price `$300.00` struck through).
17. Select "Standard Handlebars". Verify:
    - Sale price shown: `$290.00` ($250 sale + $40 option sale price)
    - List price shown (struck through): `$350.00` ($300 list + $50 option list price)
18. Select "Drop Bar". Verify:
    - Sale price shown: `$330.00` ($250 sale + $80 option sale price)
    - List price shown (struck through): `$400.00` ($300 list + $100 option list price)

**Expected Result:**
- When a sale price is set, the storefront displays the list price with a strikethrough.
- The sale price is shown as the current price.
- Both prices update correctly when configurable options with sale prices are selected.
- The price math uses sale prices for display (not list prices).

---

### TC-E2E-012: Verify that option sale price takes precedence over option list price in display

**Priority:** High
**Type:** End-to-End Functional
**Estimate:** 8 min
**Section:** Scenario 3 — Sale Price vs List Price

**Preconditions:**
- TC-E2E-011 has been completed successfully.
- Product `Test Config Sale Bike [YYYYMMDD]` is visible on `${FRONT_URL}`.

**ADMIN STEPS:**

1. (No admin steps required — verify prices in admin for reference.)

**FRONTEND VERIFICATION STEPS:**

2. Navigate to the PDP for `Test Config Sale Bike [YYYYMMDD]` on `${FRONT_URL}`.
3. Select "Standard Handlebars".
4. Verify the displayed current/active price is `$290.00` (sale price), NOT `$350.00` (list price).
5. Verify `$350.00` appears struck through or visually deprioritized.
6. Select "Drop Bar".
7. Verify the displayed current/active price is `$330.00` (sale price), NOT `$400.00` (list price).
8. Verify `$400.00` appears struck through or visually deprioritized.
9. Confirm at no point is the list price shown as the "buyable" price.

**Expected Result:**
- Sale prices are always shown as the active/current price the customer will pay.
- List prices are shown crossed out.
- This applies to both the base product price and the option-adjusted totals.

---

### TC-E2E-013: Verify sale price options are reflected correctly in cart total

**Priority:** High
**Type:** End-to-End Functional
**Estimate:** 8 min
**Section:** Scenario 3 — Sale Price vs List Price

**Preconditions:**
- TC-E2E-011 has been completed successfully.
- Product `Test Config Sale Bike [YYYYMMDD]` is visible on `${FRONT_URL}`.

**ADMIN STEPS:**

1. (No admin steps required.)

**FRONTEND VERIFICATION STEPS:**

2. Navigate to the PDP for `Test Config Sale Bike [YYYYMMDD]` on `${FRONT_URL}`.
3. Select "Drop Bar" option.
4. Verify PDP shows sale price `$330.00`.
5. Click "Add to Cart".
6. Navigate to the cart page.
7. Verify the cart line item shows `$330.00` (sale price), not `$400.00` (list price).
8. Verify the cart total reflects the sale price.

**Expected Result:**
- Cart uses sale price ($330.00) for the line item total.
- List price is not used in cart calculations.

---

## Scenario 4: Out of Stock Option

### TC-E2E-014: Create configurable product with an out-of-stock option and verify it is blocked on frontend

**Priority:** High
**Type:** End-to-End Functional
**Estimate:** 15 min
**Section:** Scenario 4 — Out of Stock Option

**Preconditions:**
- Admin is logged in at `${BACK_URL}`.
- Storefront is accessible at `${FRONT_URL}`.

**ADMIN STEPS:**

1. Navigate to `${BACK_URL}` and log in as `${ADMIN}`.
2. Go to Catalog → Products → Add new product.
3. Enter product name: `Test Config OOS Bike [YYYYMMDD]`.
4. Set SKU: `BIKE-OOS-CFG-[YYYYMMDD]`.
5. Set base List Price to `500.00` USD.
6. Set inventory to `50`.
7. Navigate to the configurable/configuration tab.
8. Add section: Name = `Frame Color`, Type = `Radio`, Required = true.
9. Add option: Name = `Red`, Price = `0.00`, Quantity = `10`. Save.
10. Add option: Name = `Blue`, Price = `0.00`, Quantity = `5`. Save.
11. Add option: Name = `Limited Edition Black`, Price = `50.00`, Quantity = `0` (out of stock). Save.
12. Add option: Name = `Silver`, Price = `25.00`, Quantity = `8`. Save.
13. Publish the product and save.

**FRONTEND VERIFICATION STEPS:**

14. Navigate to `${FRONT_URL}` and open the PDP for `Test Config OOS Bike [YYYYMMDD]`.
15. Verify the "Configure the parameters" widget shows section "Frame Color" with 4 options.
16. Verify "Red", "Blue", and "Silver" options are visible and selectable.
17. Verify "Limited Edition Black" option is visible but appears disabled, greyed out, or otherwise indicates unavailability.
18. Attempt to click/select "Limited Edition Black". Verify it cannot be selected.
19. Verify no error is thrown — the UI simply does not allow selection.
20. Select "Silver" and verify price updates to `$525.00` ($500 + $25).
21. Click "Add to Cart" with "Silver" selected. Verify the item is added successfully.

**Expected Result:**
- Out-of-stock option (qty = 0) is visible but disabled/non-selectable on the frontend.
- In-stock options (Red, Blue, Silver) remain fully selectable.
- The product can still be added to cart using an in-stock option.

---

### TC-E2E-015: Verify out-of-stock option label or indicator is displayed to the user

**Priority:** High
**Type:** End-to-End Functional
**Estimate:** 5 min
**Section:** Scenario 4 — Out of Stock Option

**Preconditions:**
- TC-E2E-014 has been completed successfully.
- Product `Test Config OOS Bike [YYYYMMDD]` is visible on `${FRONT_URL}`.

**ADMIN STEPS:**

1. (No admin steps required.)

**FRONTEND VERIFICATION STEPS:**

2. Navigate to the PDP for `Test Config OOS Bike [YYYYMMDD]` on `${FRONT_URL}`.
3. Locate "Limited Edition Black" in the "Frame Color" section.
4. Verify the option is visually distinct from in-stock options — e.g., greyed out, has "Out of Stock" text, or has a strikethrough.
5. Verify a tooltip, label, or visual cue indicates the option is unavailable.
6. Confirm in-stock options (Red, Blue, Silver) do not show any such indicator.

**Expected Result:**
- Out-of-stock options are clearly visually differentiated from available options.
- Users can understand why they cannot select the option.

---

### TC-E2E-016: Verify required section with all options out-of-stock blocks add-to-cart entirely

**Priority:** High
**Type:** End-to-End Functional
**Estimate:** 12 min
**Section:** Scenario 4 — Out of Stock Option

**Preconditions:**
- Admin is logged in at `${BACK_URL}`.
- A configurable product exists (or create one) with a required section where ALL options have qty = 0.

**ADMIN STEPS:**

1. Navigate to `${BACK_URL}` and log in.
2. Go to Catalog → Products → Add new product (or edit an existing configurable product).
3. Enter product name: `Test Config AllOOS [YYYYMMDD]`.
4. Set SKU: `CFG-ALLAOOS-[YYYYMMDD]`.
5. Set base List Price to `100.00`.
6. Set inventory to `0`.
7. Navigate to the configurable/configuration tab.
8. Add section: Name = `Material`, Type = `Radio`, Required = true.
9. Add option: Name = `Carbon`, Price = `0.00`, Quantity = `0`. Save.
10. Add option: Name = `Titanium`, Price = `50.00`, Quantity = `0`. Save.
11. Publish the product and save.

**FRONTEND VERIFICATION STEPS:**

12. Navigate to `${FRONT_URL}` and open the PDP for `Test Config AllOOS [YYYYMMDD]`.
13. Verify the "Material" section is visible with both options (Carbon, Titanium).
14. Verify both options are disabled/non-selectable.
15. Verify the "Add to Cart" button is either hidden, disabled, or shows "Out of Stock".
16. Attempt to click "Add to Cart" (if visible). Verify no item is added.

**Expected Result:**
- When all options in a required section are out of stock, the product is effectively not purchasable.
- The "Add to Cart" button is disabled or the product shows an "Out of Stock" state.

---

## Scenario 5: Complete E2E with Checkout

### TC-E2E-017: Complete purchase flow — Admin create, frontend configure, add to cart, checkout

**Priority:** Critical
**Type:** End-to-End Functional
**Estimate:** 25 min
**Section:** Scenario 5 — Complete E2E with Checkout

**Preconditions:**
- Admin is logged in at `${BACK_URL}`.
- A registered customer account exists at `${FRONT_URL}` (with valid credentials from `.env`).
- Checkout flow and payment are configured in the QA environment.
- Storefront is accessible at `${FRONT_URL}`.

**ADMIN STEPS:**

1. Navigate to `${BACK_URL}` and log in as `${ADMIN}`.
2. Go to Catalog → Products → Add new product.
3. Enter product name: `Test Config Checkout Bike [YYYYMMDD]`.
4. Set SKU: `BIKE-CHK-CFG-[YYYYMMDD]`.
5. Set base List Price to `150.00` USD.
6. Set inventory to `25`.
7. Navigate to configurable/configuration tab.
8. Add section: Name = `Wheels`, Type = `Radio`, Required = true.
9. Add option: Name = `Standard Wheels`, Price = `0.00`, Quantity = `25`. Save.
10. Add option: Name = `Sport Wheels`, Price = `50.00`, Quantity = `10`. Save.
11. Publish the product and save.

**FRONTEND VERIFICATION STEPS:**

12. Navigate to `${FRONT_URL}` and sign in with registered customer credentials.
13. Search for `Test Config Checkout Bike [YYYYMMDD]` or navigate to the product URL.
14. On the PDP, verify section "Wheels" is visible with two options: Standard Wheels, Sport Wheels.
15. Select "Sport Wheels". Verify price updates to `$200.00` ($150 + $50).
16. Click "Add to Cart". Verify item is added.
17. Navigate to the cart. Verify item `Test Config Checkout Bike [YYYYMMDD]` at `$200.00` with "Sport Wheels" selected.
18. Click "Proceed to Checkout" (or equivalent).
19. On the checkout page, verify the item is listed with price `$200.00` and configuration "Sport Wheels".
20. Complete the checkout flow (use test payment method configured in QA environment).
21. Verify order confirmation page is shown with order number.
22. Navigate to Account → Order History.
23. Verify the order appears with product `Test Config Checkout Bike [YYYYMMDD]`.
24. Verify the order shows the correct total including the Sport Wheels option price.

**Expected Result:**
- The full purchase flow works end-to-end for a configurable product.
- The selected configuration (Sport Wheels) is preserved from PDP through cart, checkout, and order history.
- Order total reflects $200.00 (base $150 + Sport Wheels $50).

---

### TC-E2E-018: Verify order history shows configured option details

**Priority:** High
**Type:** End-to-End Functional
**Estimate:** 10 min
**Section:** Scenario 5 — Complete E2E with Checkout

**Preconditions:**
- TC-E2E-017 has been completed successfully.
- The order is visible in the customer's order history.

**ADMIN STEPS:**

1. Navigate to `${BACK_URL}` → Orders and locate the order created in TC-E2E-017.
2. Open the order and verify line item shows: Product = `Test Config Checkout Bike [YYYYMMDD]`, Configuration = Sport Wheels, Price = $200.00.

**FRONTEND VERIFICATION STEPS:**

3. Navigate to `${FRONT_URL}` → Account → Order History.
4. Find the order created in TC-E2E-017.
5. Open the order detail page.
6. Verify the product name `Test Config Checkout Bike [YYYYMMDD]` is shown.
7. Verify the configuration option "Sport Wheels" is displayed in the order line item.
8. Verify the line item price shows `$200.00`.

**Expected Result:**
- Order history (both admin and customer-facing) shows the configured option alongside the product.
- Prices are consistent between checkout confirmation and order history.

---

### TC-E2E-019: Verify multiple configurable products in one checkout

**Priority:** High
**Type:** End-to-End Functional
**Estimate:** 20 min
**Section:** Scenario 5 — Complete E2E with Checkout

**Preconditions:**
- TC-E2E-001 (Bike product) and TC-E2E-006 (Laptop product) have been completed.
- Both products are visible on `${FRONT_URL}`.
- A registered customer account exists.

**ADMIN STEPS:**

1. (No admin steps required — products already exist.)

**FRONTEND VERIFICATION STEPS:**

2. Navigate to `${FRONT_URL}` and sign in.
3. Go to PDP for `Test Config Bike [YYYYMMDD]`. Select "Premium Seat". Add to Cart.
4. Go to PDP for `Test Config Laptop [YYYYMMDD]`. Select RAM = `16GB` and Storage = `512GB SSD`. Add to Cart.
5. Navigate to cart. Verify both items are in cart:
   - Bike at `$245.00` (Premium Seat selected)
   - Laptop at `$1,174.00` (16GB RAM + 512GB SSD selected)
6. Verify cart subtotal shows `$1,419.00`.
7. Proceed through checkout and place order.
8. Verify order confirmation shows both items with their respective configurations and prices.

**Expected Result:**
- Multiple configurable products can be in the same cart and checkout.
- Each product's configuration is preserved independently.
- Cart and order totals are correct.

---

### TC-E2E-020: Verify cart quantity update for configurable product

**Priority:** High
**Type:** End-to-End Functional
**Estimate:** 8 min
**Section:** Scenario 5 — Complete E2E with Checkout

**Preconditions:**
- TC-E2E-001 has been completed.
- Product `Test Config Bike [YYYYMMDD]` is visible on `${FRONT_URL}`.

**ADMIN STEPS:**

1. (No admin steps required.)

**FRONTEND VERIFICATION STEPS:**

2. Navigate to the PDP for `Test Config Bike [YYYYMMDD]` on `${FRONT_URL}`.
3. Select "Basic Seat". Verify price = `$215.00`.
4. Set quantity to `3`.
5. Click "Add to Cart".
6. Navigate to cart. Verify: product `Test Config Bike [YYYYMMDD]`, configuration "Basic Seat", quantity = 3, line total = `$645.00` (3 x $215).
7. Update quantity in cart to `2`.
8. Verify cart line total updates to `$430.00` (2 x $215).
9. Verify configuration "Basic Seat" is still shown correctly for the line item.

**Expected Result:**
- Quantity updates in cart correctly recalculate the line total.
- The selected configuration (Basic Seat) remains associated with the product after quantity change.

---

## Scenario 6: Admin Edit Option Price

### TC-E2E-021: Edit option price in Admin and verify updated price on frontend

**Priority:** High
**Type:** End-to-End Functional
**Estimate:** 15 min
**Section:** Scenario 6 — Admin Edit Option Price

**Preconditions:**
- TC-E2E-001 has been completed.
- Product `Test Config Bike [YYYYMMDD]` exists in Admin and is visible on `${FRONT_URL}`.
- Admin is logged in at `${BACK_URL}`.

**ADMIN STEPS:**

1. Navigate to `${BACK_URL}` and log in as `${ADMIN}`.
2. Go to Catalog → Products and open `Test Config Bike [YYYYMMDD]`.
3. Navigate to the configurable/configuration tab.
4. Find the "Premium Seat" option under the "Choose Upgrade" section.
5. Edit "Premium Seat" price: change from `45.00` to `60.00`. Save the option.
6. Save the product.
7. Note the time of the change.

**FRONTEND VERIFICATION STEPS:**

8. Navigate to `${FRONT_URL}` and open the PDP for `Test Config Bike [YYYYMMDD]`.
9. If the page was already open, perform a hard reload (Ctrl+Shift+R or clear cache).
10. In the "Choose Upgrade" section, select "Premium Seat".
11. Verify the displayed price is now `$260.00` ($200 base + $60 updated option price), NOT the old `$245.00`.
12. Select "Basic Seat" — verify price = `$215.00` (unchanged).
13. Select "Racing Seat" — verify price = `$295.00` (unchanged).

**Expected Result:**
- After saving the updated price in Admin, the storefront reflects the new price for "Premium Seat".
- The updated price ($260.00) is shown instead of the old price ($245.00).
- Other options are unaffected.

---

### TC-E2E-022: Verify cart reflects updated option price after admin edit

**Priority:** High
**Type:** End-to-End Functional
**Estimate:** 10 min
**Section:** Scenario 6 — Admin Edit Option Price

**Preconditions:**
- TC-E2E-021 has been completed.
- "Premium Seat" price is now $60.00 in Admin.
- Product is visible on `${FRONT_URL}`.

**ADMIN STEPS:**

1. (No admin steps required — price already updated in TC-E2E-021.)

**FRONTEND VERIFICATION STEPS:**

2. Navigate to the PDP for `Test Config Bike [YYYYMMDD]` on `${FRONT_URL}`.
3. Select "Premium Seat". Verify price = `$260.00`.
4. Click "Add to Cart".
5. Navigate to cart. Verify line item price shows `$260.00`.
6. Verify cart line item description shows "Premium Seat".

**Expected Result:**
- Cart uses the updated price ($260.00) for the "Premium Seat" option.
- The old price ($245.00) is no longer used.

---

### TC-E2E-023: Edit option name in Admin and verify updated name on frontend

**Priority:** Medium
**Type:** End-to-End Functional
**Estimate:** 10 min
**Section:** Scenario 6 — Admin Edit Option Price

**Preconditions:**
- TC-E2E-001 has been completed.
- Admin is logged in at `${BACK_URL}`.
- Product `Test Config Bike [YYYYMMDD]` is visible on `${FRONT_URL}`.

**ADMIN STEPS:**

1. Navigate to `${BACK_URL}` and open `Test Config Bike [YYYYMMDD]`.
2. Navigate to configurable/configuration tab.
3. Find the "Basic Seat" option under "Choose Upgrade".
4. Edit the option name: change from `Basic Seat` to `Standard Seat`. Save the option.
5. Save the product.

**FRONTEND VERIFICATION STEPS:**

6. Navigate to `${FRONT_URL}` and open the PDP for `Test Config Bike [YYYYMMDD]`. Hard reload.
7. In the "Choose Upgrade" section, verify "Basic Seat" is no longer shown.
8. Verify "Standard Seat" now appears in its place.
9. Select "Standard Seat". Verify price = `$215.00` (price is unchanged).
10. Verify the other options remain: None, Premium Seat, Racing Seat.

**Expected Result:**
- Renaming an option in Admin is reflected immediately on the frontend after reload.
- The new name "Standard Seat" is displayed instead of "Basic Seat".
- Option price and other options are unaffected.

---

## Scenario 7: Admin Delete Option

### TC-E2E-024: Delete an option in Admin and verify it disappears from frontend

**Priority:** High
**Type:** End-to-End Functional
**Estimate:** 12 min
**Section:** Scenario 7 — Admin Delete Option

**Preconditions:**
- TC-E2E-001 has been completed (and optionally TC-E2E-023 so "Basic Seat" is now "Standard Seat").
- Admin is logged in at `${BACK_URL}`.
- Product `Test Config Bike [YYYYMMDD]` is visible on `${FRONT_URL}` with 4 options.

**ADMIN STEPS:**

1. Navigate to `${BACK_URL}` and log in as `${ADMIN}`.
2. Open `Test Config Bike [YYYYMMDD]` in Catalog → Products.
3. Navigate to configurable/configuration tab.
4. Find the "Racing Seat" option under "Choose Upgrade".
5. Click the delete/remove button for "Racing Seat". Confirm the deletion.
6. Verify the section now shows only 3 options: None, Standard Seat (or Basic Seat), Premium Seat.
7. Save the product.

**FRONTEND VERIFICATION STEPS:**

8. Navigate to `${FRONT_URL}` and open the PDP for `Test Config Bike [YYYYMMDD]`. Hard reload.
9. In the "Choose Upgrade" section, verify only 3 options are shown.
10. Verify "Racing Seat" is NOT present in the list.
11. Verify the remaining options (None, Standard/Basic Seat, Premium Seat) are all still present.
12. Select "Premium Seat". Verify price = correct value based on current admin configuration.
13. Verify the "Configure the parameters" widget still functions normally with the remaining options.

**Expected Result:**
- Deleted option "Racing Seat" no longer appears on the frontend after page reload.
- Remaining options are unaffected and still functional.
- Price calculation still works correctly with the remaining options.

---

### TC-E2E-025: Delete an entire configuration section in Admin and verify widget updates on frontend

**Priority:** High
**Type:** End-to-End Functional
**Estimate:** 15 min
**Section:** Scenario 7 — Admin Delete Option

**Preconditions:**
- TC-E2E-006 has been completed.
- Product `Test Config Laptop [YYYYMMDD]` exists with two sections: RAM and Storage.
- Admin is logged in at `${BACK_URL}`.

**ADMIN STEPS:**

1. Navigate to `${BACK_URL}` and open `Test Config Laptop [YYYYMMDD]`.
2. Navigate to configurable/configuration tab.
3. Find the "Storage" section.
4. Click the delete/remove button for the entire "Storage" section. Confirm deletion.
5. Verify only the "RAM" section remains.
6. Save the product.

**FRONTEND VERIFICATION STEPS:**

7. Navigate to `${FRONT_URL}` and open the PDP for `Test Config Laptop [YYYYMMDD]`. Hard reload.
8. Verify the "Configure the parameters" widget now shows only ONE section: "RAM".
9. Verify the "Storage" section is completely gone from the widget.
10. Verify RAM options (8GB, 16GB, 32GB) are still present and selectable.
11. Select RAM = `32GB`. Verify price = `$1,249.00` ($999 + $250) — no Storage price added.
12. If "RAM" is still required, verify add-to-cart is blocked without selecting it.
13. Select RAM = `8GB`. Click "Add to Cart". Verify cart shows laptop at `$999.00` (no Storage component).

**Expected Result:**
- Deleting an entire section removes it from the frontend widget.
- The "Storage" section is gone, and only "RAM" remains.
- Price is recalculated without the Storage component.

---

### TC-E2E-026: Verify deleting the only section removes the configuration widget entirely

**Priority:** High
**Type:** End-to-End Functional
**Estimate:** 12 min
**Section:** Scenario 7 — Admin Delete Option

**Preconditions:**
- TC-E2E-025 has been completed (laptop now has only one section: RAM).
- Admin is logged in at `${BACK_URL}`.

**ADMIN STEPS:**

1. Navigate to `${BACK_URL}` and open `Test Config Laptop [YYYYMMDD]`.
2. Navigate to configurable/configuration tab.
3. Find the remaining "RAM" section.
4. Delete the "RAM" section entirely. Confirm deletion.
5. Verify no sections remain in the configuration tab.
6. Save the product.

**FRONTEND VERIFICATION STEPS:**

7. Navigate to `${FRONT_URL}` and open the PDP for `Test Config Laptop [YYYYMMDD]`. Hard reload.
8. Verify the "Configure the parameters" widget is NO LONGER visible on the PDP.
9. Verify the product is now treated as a standard non-configurable product.
10. Verify the base product price `$999.00` is shown without any configuration options.
11. Verify "Add to Cart" is accessible and functional without any configuration required.

**Expected Result:**
- When all sections are deleted, the configuration widget is removed from the PDP entirely.
- The product behaves as a standard product with no configuration required.

---

### TC-E2E-027: Verify deleting a required option when it was the default forces user re-selection

**Priority:** Medium
**Type:** End-to-End Functional
**Estimate:** 10 min
**Section:** Scenario 7 — Admin Delete Option

**Preconditions:**
- TC-E2E-014 has been completed.
- Product `Test Config OOS Bike [YYYYMMDD]` exists with section "Frame Color" containing: Red, Blue, Limited Edition Black (qty=0), Silver.
- Admin is logged in at `${BACK_URL}`.

**ADMIN STEPS:**

1. Navigate to `${BACK_URL}` and open `Test Config OOS Bike [YYYYMMDD]`.
2. Navigate to configurable/configuration tab.
3. Delete the "Limited Edition Black" option entirely (not just set qty to 0 — fully delete).
4. Verify "Frame Color" section now shows: Red, Blue, Silver (3 options).
5. Save the product.

**FRONTEND VERIFICATION STEPS:**

6. Navigate to `${FRONT_URL}` and open the PDP for `Test Config OOS Bike [YYYYMMDD]`. Hard reload.
7. In the "Frame Color" section, verify only 3 options are shown: Red, Blue, Silver.
8. Verify "Limited Edition Black" is NOT present (neither enabled nor disabled).
9. Select "Blue". Verify price = `$500.00` (base price, no option surcharge).
10. Click "Add to Cart". Verify item is added successfully.

**Expected Result:**
- The deleted option "Limited Edition Black" is completely removed, not just shown as disabled.
- Remaining options are all enabled and selectable.
- The product can be added to cart with any of the remaining options.

---

## Test Data Summary

| Product Name | SKU Pattern | Base Price | Sections | Notes |
|---|---|---|---|---|
| Test Config Bike [YYYYMMDD] | BIKE-CFG-[date] | $200 | Choose Upgrade (Optional, Radio, 4 options) | Scenarios 1, 6, 7 |
| Test Config Laptop [YYYYMMDD] | LAPTOP-CFG-[date] | $999 | RAM (Required, Radio), Storage (Required, Radio) | Scenario 2 |
| Test Config Sale Bike [YYYYMMDD] | BIKE-SALE-CFG-[date] | $300 list / $250 sale | Handlebars (Optional, Radio) | Scenario 3 |
| Test Config OOS Bike [YYYYMMDD] | BIKE-OOS-CFG-[date] | $500 | Frame Color (Required, Radio, 1 qty=0) | Scenario 4 |
| Test Config AllOOS [YYYYMMDD] | CFG-ALLAOOS-[date] | $100 | Material (Required, Radio, all qty=0) | Scenario 4 |
| Test Config Checkout Bike [YYYYMMDD] | BIKE-CHK-CFG-[date] | $150 | Wheels (Required, Radio) | Scenario 5 |

---

## Environment References

| Variable | Purpose |
|---|---|
| `${BACK_URL}` | Virto Commerce Admin SPA base URL |
| `${FRONT_URL}` | Virto Commerce Storefront base URL |
| `${ADMIN}` | Admin username |
| `${ADMIN_PASSWORD}` | Admin password |
| `${USER_EMAIL}` | Registered customer email |
| `${USER_PASSWORD}` | Registered customer password |
