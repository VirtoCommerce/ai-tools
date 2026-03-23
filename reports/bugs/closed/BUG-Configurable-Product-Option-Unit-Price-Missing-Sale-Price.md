# Bug Report: Configurable Product Option Unit Price Does Not Show Sale Price

**Bug ID:** BUG-Config-Option-UnitPrice-001
**Severity:** Medium
**Priority:** P2
**Environment:** https://virtostart-demo-store.govirto.com/
**Browser:** Chrome 144.0.7559.110
**Date Tested:** 2026-02-03

---

## Summary

When viewing configuration options for a configurable product ("Bike with options"), the unit price displayed for options with discounts only shows the **list price** (original price), not the **sale price** (discounted price). This is inconsistent with standard e-commerce pricing display patterns where both prices should be shown when a discount exists, with the list price having a strikethrough.

---

## Product Under Test

- **Product:** Bike with options
- **SKU:** ZER-64605169
- **URL:** https://virtostart-demo-store.govirto.com/products-with-options/build-the-bike-of-your-dreams/bike-with-options

---

## Steps to Reproduce

1. Navigate to https://virtostart-demo-store.govirto.com/products-with-options/build-the-bike-of-your-dreams/bike-with-options
2. Expand the WHEELS configuration section by clicking on it
3. Observe the "Rear wheel, 26", double-wall rim, motorized" option
4. Note the unit price displayed for this option

---

## Expected Result

For configuration options that have a discount (listPrice != salePrice), the UI should display:
- The list price with strikethrough (e.g., ~~$100.00~~)
- The sale price prominently (e.g., $65.00)
- Similar to how standalone products are displayed in "Products Related to This Item" section

---

## Actual Result

The configuration option only displays the **list price** ($100.00), without any indication that:
- There is a discount available
- The actual sale price is $65.00 per unit
- The extended price ($130.00) is calculated using the sale price, not the displayed unit price

This creates confusion because:
- User sees unit price: $100.00
- User sees quantity: 2
- User expects extended price: $200.00
- But extended price shown is: $130.00

---

## API vs UI Comparison

### WHEELS Section - "Rear wheel, 26", double-wall rim, motorized"

| Field | API Response | UI Display | Status |
|-------|-------------|------------|--------|
| listPrice | $100.00 | $100.00 | SHOWN |
| salePrice | $65.00 | NOT SHOWN | **MISSING** |
| quantity | 2 | 2 | CORRECT |
| extendedPrice | $130.00 | $130.00 | CORRECT |
| Discount indicator | 35% off | NOT SHOWN | **MISSING** |

### Comparison with Related Products Section

In the "Products Related to This Item" section on the same page, the same "Rear wheel" product displays **both prices**:
- Sale price: $65.00 (prominent)
- List price: $100.00 (strikethrough)

This demonstrates the expected behavior that should be applied to configuration options.

---

## Evidence

### Screenshots
- `configurable-bike-initial-state.png` - Initial page view
- `configurable-bike-wheels-expanded.png` - WHEELS section expanded showing unit price issue
- `configurable-bike-price-display.png` - Sidebar showing total prices
- `configurable-bike-all-sections-expanded.png` - All configuration sections

### API Traces
- `GetProductConfigurations-response.json` - Full API response showing listPrice vs salePrice data

---

## Impact

1. **User Confusion:** Users cannot understand how the extended price is calculated
2. **Price Transparency:** Discounts on configuration options are hidden from users
3. **Inconsistent UX:** Pricing display is inconsistent between configuration options and related products
4. **Potential Lost Sales:** Users may perceive the product as more expensive than it actually is

---

## Recommended Fix

Update the configuration option display component to:
1. Show sale price prominently when listPrice != salePrice
2. Show list price with strikethrough when there's a discount
3. Optionally show discount percentage badge (e.g., "-35%")
4. Follow the same pricing display pattern used in product cards throughout the site

---

## Related Test Cases

- VCST-4373: Configurable Products Testing
- Cart pricing verification for configurable products

---

## Additional Notes

### Other Sections Verified (No Issues)

**PEDALS Section:**
- listPrice = salePrice = $15.00 (no discount)
- Single price display is appropriate

**SEAT Section:**
- listPrice = salePrice = $23.00 (no discount)
- Single price display is appropriate

### Total Price Calculation

The sidebar total prices appear to be calculated correctly:
- List Price: $1,035.00 = $805 (base) + $200 (wheels 2x$100) + $30 (pedals 2x$15)
- Sale Price: $695.00 (calculation method unclear, possible discrepancy - see separate investigation)
