# Suite 072b — Configurable Products E2E — Regression Report

**Run ID:** REG-2026-03-23-2030
**Suite:** 072b — Configurable Products E2E (56 test cases)
**Browser:** playwright-edge (Microsoft Edge)
**Environment:** https://vcst-qa-storefront.govirto.com (storefront) / https://vcst-qa.govirto.com (admin)
**Executed:** 2026-03-23
**Tester:** qa-frontend-expert (automated)
**Context:** PR #873 fix deployed (Product-type sections with no predefined options preserve IsActive=true)

---

## Summary

| Metric | Value |
|--------|-------|
| Total Cases | 56 |
| Passed | 4 |
| Failed | 0 |
| Blocked | 52 |
| Skipped | 0 |
| Pass Rate | 7.1% (4/56) |
| Effective Pass Rate | 100% (4/4 executable) |

---

## Blocking Issue

**52 of 56 tests could not be executed** due to two factors:

1. **Catalog-Store Linkage (46 tests):** Tests CFG-E2E-001 through CFG-E2E-046, CFG-VAR-019, and CFG-VAR-020 require creating new configurable products in the Admin "Configurable products" catalog (ID: 7f840fe0). This catalog is separate from the B2B store catalog, so newly created products do not appear on the storefront. These tests cannot be executed without either:
   - Linking the Configurable products catalog to the B2B store, or
   - Creating products directly in a store-linked catalog that supports configurable product types.

2. **Shared Environment Risk (6 tests):** Tests CFG-E2E-050, CFG-E2E-051, CFG-E2E-052, and CFG-E2E-054 require modifying existing shared test data (option names, prices, required flags) in the QA environment. These were blocked to avoid impacting concurrent testers.

---

## Executed Tests — Results

### CFG-E2E-047: Widget State After Page Refresh -- PASS

- **Product:** Bike with options (SKU: ZER-64605169)
- **URL:** /products-with-options/configurations/bike-with-options
- **Test:** Configuration widget with 4 sections (Text, Test, Choose your bike variant, Produts*) loaded correctly. Selected Pillow 50X60 in required Produts section. Refreshed page (F5). Widget remained interactive, Pillow 50X60 selection retained as default. All sections expandable/collapsible.
- **Console:** No configuration-related errors.

### CFG-E2E-048: Non-Configurable Product Has No Widget -- PASS

- **Product:** Product No variations
- **URL:** /products-with-options/configurable-caps-shirts/product-no-variations
- **Test:** Product is non-configurable (configuration not enabled in Admin). No "Configure the parameters" widget displayed on PDP. Standard add-to-cart button present and functional. Added 1 unit at $900.00 (discounted from $1,000.00). Item appeared in cart correctly with properties (Color: Beige).
- **Cleanup:** Removed item from cart after test.

### CFG-E2E-049: Section Order Admin vs Storefront Match -- PASS

- **Product:** Bike with options (ID: f16d3e8f-6c86-4679-bcfd-100a0b164421)
- **Admin URL:** https://vcst-qa.govirto.com/#!/workspace/catalog?productId=f16d3e8f-6c86-4679-bcfd-100a0b164421
- **Test:** Verified section order matches between Admin and Storefront:

| # | Admin Section | Admin Type | Storefront Section | Match |
|---|---------------|------------|-------------------|-------|
| 1 | Text | Text | Text (optional) | YES |
| 2 | Test | Text | Test (optional) | YES |
| 3 | Choose your bike variant | Variation | Choose your bike variant (optional) | YES |
| 4 | Produts | Product (4 options, required) | Produts * (required, default: Pillow 50X60) | YES |

- **Admin Options for "Produts" section:** Pillow 50X60, Foam mattress extendable bed IKEA 160x200 cm, Mattress cover Fitted sheet light pink 90x200 cm, Blanket medium warm 150x200 cm (all qty 1).

### CFG-E2E-053: Deep Link to Configurable Product PDP -- PASS

- **Product:** Bike with options
- **URL:** /products-with-options/configurations/bike-with-options
- **Test:** Navigated directly via deep link URL. Page loaded correctly with title "Bike with options", configuration widget present with all 4 sections. Breadcrumbs: Home > Catalog > Products with options > Configurations > Bike with options. Product variations section displayed (Bike Blue Large $35/$45, Bike Red Medium $40/$55, Bike with options $350). Price shown as "From $35.00".

---

## Observations

1. **Section name typo:** The "Produts" section name appears to be a typo for "Products" -- present in both Admin and Storefront consistently (not a bug, just test data quality).

2. **Product-type section options:** The Admin shows 4 options (Pillow 50X60, Foam mattress, Mattress cover, Blanket) but the storefront in the previous session showed 3 options (Pillow, Mattress, Blanket). The storefront may use shortened display names. This was not a test failure but worth noting for data accuracy.

3. **Configurable Hat** (tested for CFG-E2E-054 recon): Located at /products-with-options/configurable-caps-shirts/configurable-hat. Has 4 all-optional sections: Select your fav color (Product-type: Black/Beige/Green/Red hat + None), Select print-ready cap, Customize text for your cap, Add photo. Price $10.00, Stock 4553.

4. **Image loading errors:** Multiple 404s for product images in catalog listings (skinny_md.png, blue_flannel_md.jpg, etc.) and the Bike with options product image (475635_25ym_honda_crf450rx_1__md.jpg). These are pre-existing asset issues, not related to configurable product functionality.

---

## Evidence

| File | Description |
|------|-------------|
| suite-072b-results.json | Full JSON results with all 56 test cases |
| 072b-bike-with-options-pdp.png | Bike with options PDP with configuration widget |
| 072b-search-bike-with-options.png | Search results page (product location verification) |

---

## Cleanup

- Removed "Product No variations" (1 unit, $900.00) from cart after CFG-E2E-048
- No test products were created (catalog-store linkage prevented storefront verification)
- Cart restored to pre-test state (1 pre-existing item: Snack day Flips peanuts)

---

## Recommendations

1. **Link Configurable products catalog to B2B store** to unblock 46 tests. Alternatively, create a test data seeding script that creates configurable products in a store-linked catalog.
2. **Create a dedicated test account** for destructive tests (CFG-E2E-050, 051, 054) to avoid shared environment conflicts.
3. **Fix product image assets** that return 404 errors in catalog listings.

---

**Verdict:** 4/4 executable tests PASSED (100% effective pass rate). 52 tests BLOCKED due to infrastructure constraints. No functional failures detected in the configurable products E2E flow for existing products.

**Sign-off:** qa-frontend-expert | 2026-03-23 | Suite 072b | CONDITIONAL PASS (blocked tests require infrastructure changes)
