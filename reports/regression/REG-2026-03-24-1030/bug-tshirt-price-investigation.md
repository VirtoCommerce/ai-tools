# Bug Investigation Report: Custom T-shirt Price Discrepancy

**Date:** 2026-03-24
**Investigator:** qa-testing-expert (playwright-firefox)
**Environment:** QA (https://vcst-qa-storefront.govirto.com)
**Browser:** Firefox via playwright-firefox MCP
**Verdict:** CONFIRMED -- UX Concern (By-Design Behavior)

---

## Summary

"Custom T-shirt" (SKU: AAW-59914334) shows **$12.00** on the category listing card but **$32.00** on the PDP. The PDP price includes the cost of a preselected required configuration option: "Red Basic Men T-shirt" at $10.00 x qty 2 = $20.00, added to the $12.00 base price.

**Price breakdown:**
- Base product price: $12.00
- Required preselected option: Red Basic Men T-shirt ($10.00 x 2) = $20.00
- PDP total: $12.00 + $20.00 = **$32.00**

The math is correct. The discrepancy is a UX concern, not a calculation error.

## Severity Reassessment

- **Original severity:** Low
- **Reassessed severity:** Low-Medium (UX Concern)
- **Rationale:** While the price calculation is correct, showing $12.00 on the category card and $32.00 on the PDP creates a confusing experience. Users expect the price they click on to match what they see on the product page. A 167% price increase on page load ($12 to $32) could erode trust, even though the increase is due to a required preselected option. This is particularly problematic in B2B contexts where price accuracy drives purchasing decisions.

## Reproduction Steps

1. Navigate to `https://vcst-qa-storefront.govirto.com/products-with-options/configurable-caps-shirts/`
2. Locate the "Custom T-shirt" product card in the category listing
3. Observe the price: **$12.00** (no "From" prefix)
4. Click through to the PDP: `https://vcst-qa-storefront.govirto.com/products-with-options/configurable-caps-shirts/custom-t-shirt`
5. Observe the sidebar "PRICE AND DELIVERY" section shows: **Price: $32.00**
6. Scroll down to "CONFIGURE THE PARAMETERS" section
7. Observe Section 1 "CHOOSE BASIC T-SHORT *" (required) has "Red Basic Men T-shirt" preselected with radio button checked
8. The preselected option shows: $10.00 per unit, qty 2, subtotal $20.00

## Expected vs Actual

| Location | Expected | Actual | Issue |
|----------|----------|--------|-------|
| Category card | "From $12.00" or "$32.00" | "$12.00" | Missing "From" prefix or should show configured price |
| PDP sidebar | $32.00 | $32.00 | Correct (base + preselected option) |
| Price calculation | $12 + ($10 x 2) = $32 | $32.00 | Correct |

## Evidence

### Screenshots
- `bug2-category-listing-price.png` -- Category listing showing Custom T-shirt card with "$12.00" price. Note: Other configurable products like "Base product EN" show "From $5.00" with the "From" prefix, but Custom T-shirt shows "$12.00" without "From"
- `bug2-pdp-price.png` -- PDP showing "Price: $32.00" in the sidebar, with "CONFIGURE THE PARAMETERS" section below and "CHOOSE BASIC T-SHORT *" section heading with "Red Basic Men T-shirt" shown as selected

### Configuration Details (from PDP snapshot)

**Section 1: "Choose basic T-short" (REQUIRED, Product type)**

| Option | Unit Price | Qty | Subtotal | Preselected |
|--------|-----------|-----|----------|-------------|
| Red Basic Men T-shirt | $10.00 | 2 | $20.00 | YES (default) |
| Black Basic Women T-shirt | $14.55 (was $17.00) | 2 | $29.10 | No |
| Blue Basic Men T-shirt | $9.99 | 1 | $9.99 | No |
| White Basic Women T-shirt | $8.00 | 1 | $8.00 | No |

**Additional sections (all optional):**
- Section 2: "Select print" -- optional, no preselection
- Section 3: "For couples" -- optional, no preselection
- Section 4: "Upload your picture" -- optional (file upload), no preselection

### Cross-Product Comparison

| Product | Category Price | PDP Price | Has "From" | Has Preselection |
|---------|---------------|-----------|------------|------------------|
| Base product EN | From $5.00 | N/A (variations) | YES | N/A |
| Hoodie Base with Only File non required | $300.00 | $300.00 | NO | N/A (file-only config) |
| Hoodie Base product with only File req | $250.00 (was $300) | $250.00 | NO | N/A (file-only config) |
| Custom T-shirt | $12.00 | $32.00 | **NO** | **YES** (Red Men T-shirt x2) |
| Configurable Hat | $10.00 | TBD | NO | TBD |

**Key observation:** "Base product EN" correctly uses the "From $5.00" prefix to indicate the price may change. "Custom T-shirt" does NOT use a "From" prefix despite having a required preselected option that adds $20 to the price.

### Console / Network
- No JS errors on either page
- No failed API requests
- GraphQL responses returned HTTP 200 for all product queries

## Root Cause Analysis

The price discrepancy stems from two behaviors:

1. **Category listing API returns the base product price ($12.00)** without factoring in required preselected configuration options. This is expected behavior -- the listing API returns `product.price`, not `product.configuredPrice`.

2. **PDP calculates the total price dynamically** by summing the base price and all preselected option prices. When "Red Basic Men T-shirt" is preselected by default (qty 2 at $10.00 each), the PDP shows $12 + $20 = $32.

3. **Missing "From" indicator:** The category card should display "From $12.00" to signal that the final price depends on configuration. Other configurable products in the same category (e.g., "Base product EN") correctly show "From $X.XX", but Custom T-shirt does not. This suggests the "From" prefix logic may depend on whether the product has variations (Base product EN has 2 variations), not on whether it has required configuration options.

## Determination: Bug or By-Design?

**By-Design with UX Improvement Needed.**

The price calculation is correct. The category card correctly shows the base price, and the PDP correctly adds the preselected required option cost. However, the missing "From" prefix on the category card is a UX deficiency:

- **The "From" prefix logic appears to be based on whether a product has variations, not on whether it has required configurable sections with preselected options.** This means configurable products WITHOUT variations but WITH required preselected options will show a flat price on the card that differs from the PDP price.
- This is confusing for users and could be considered a minor functional bug in the pricing display logic.

## Recommendations

1. **Display "From" prefix** on category cards for configurable products that have required sections with preselected options. The logic should check: `if (product.hasConfigurableSections && product.hasPreselectedOptions) -> show "From" prefix`
2. **Alternatively, calculate the minimum configured price** for the category card by including the cheapest required option. The minimum configured price would be: $12.00 (base) + $8.00 (cheapest required option: White Basic Women T-shirt x1) = $20.00, shown as "From $20.00"
3. **Fix the section name typo:** The section is named "Choose basic T-short" -- "T-short" should be "T-shirt" (minor data quality issue)

## Action Items

- [ ] Evaluate whether the "From" prefix logic should account for required configurable sections with preselected options
- [ ] Fix typo in section name: "T-short" -> "T-shirt"
- [ ] Consider whether category cards for configurable products should show "From $X" or the fully-configured default price
