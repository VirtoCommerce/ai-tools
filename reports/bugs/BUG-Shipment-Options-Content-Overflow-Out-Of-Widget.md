# BUG: Shipment Options Content Overflows Outside Widget Container

**Bug ID:** BUG-ShipmentOverflow-001
**Jira Ticket:** [VCST-4597](https://virtocommerce.atlassian.net/browse/VCST-4597)
**Related Ticket:** [VCST-4556](https://virtocommerce.atlassian.net/browse/VCST-4556)
**Date Reported:** 2026-02-06
**Reporter:** Claude Code QA Automation
**Severity:** Medium
**Priority:** P2

---

## Summary

On the product detail page for out-of-stock items, the Shipment Options widget content (In-Store Pickup locations list) overflows and renders outside the widget container boundaries. The pickup location entries break out of the widget, creating a layout/CSS overflow issue. Additionally, shipment options with active delivery timeframes are displayed for a product that cannot be added to cart, which is misleading to customers.

---

## Environment

- **URL:** https://vcst-qa-storefront.govirto.com/alcoholic-drinks/distilled/jameson-irish-whiskey-fles-100l
- **Version:** 2.41.0-alpha.2219
- **Browser:** Firefox (Gecko) via Playwright -- also reproduced in Chrome
- **Viewport:** Desktop (1920x1080)
- **Store:** QA Environment
- **Product:** JAMESON IRISH WHISKEY FLES 1,00L (SKU #318128)

---

## Steps to Reproduce

1. Navigate to https://vcst-qa-storefront.govirto.com/alcoholic-drinks/distilled/jameson-irish-whiskey-fles-100l
2. Observe the product page loads (product is out of stock -- "You'll be notified" button shown instead of Add to Cart)
3. Look at the right sidebar -- "SHIPMENT OPTIONS" section
4. Observe the In-Store Pickup locations list
5. Notice the location entries overflow/extend beyond the widget container boundaries

---

## Expected Result

- Shipment Options widget should contain all content within its defined boundaries
- Pickup location list should be scrollable within the widget if content exceeds the container height, or be properly clipped
- For out-of-stock products, shipment options should either:
  - Be hidden entirely, OR
  - Show "Unavailable" status per location instead of active delivery timeframes, OR
  - Display a clear "This product is currently unavailable" banner

---

## Actual Result

- The Shipment Options content (5 pickup locations) renders **outside the widget container** -- content has moved out of the widget boundaries
- 5 In-Store Pickup locations are listed with active "Delivery 2-3 days [global transfer]" timeframes despite the product being out of stock
- No explicit "Out of Stock" label is shown on the page -- only the indirect "You'll be notified" button indicates unavailability
- The combination of overflow layout + misleading availability creates a poor and confusing user experience

### Locations displayed (all with "Delivery 2-3 days [global transfer]"):

| # | Location Name | Notes |
|---|---------------|-------|
| 1 | 9/11 Memorial - Main_2; Transfer_1 | Internal data ("Main_2; Transfer_1") leaking into UI |
| 2 | Airoport&the International Centre | Typo: "Airoport" should be "Airport" |
| 3 | Apollo Theater | - |
| 4 | Apple Williamsburg - Main Illinois | - |
| 5 | Arthur Avenue Retail Market | - |

---

## Additional Issues Found on Same Page

| # | Severity | Description |
|---|----------|-------------|
| 1 | Low | Typo in location name: "**Airoport**" should be "Airport" |
| 2 | Low | Internal warehouse metadata visible to customers: "Main_2; Transfer_1" suffix |
| 3 | Medium | No explicit "Out of Stock" text/badge anywhere on the product page |

---

## Evidence

### Screenshots

| Screenshot | Path |
|------------|------|
| Product page (Firefox) | `test-results/firefox/FR-B2C-VAR-002-out-of-stock.png` |
| Full product page (Chrome) | `reports/regression/product-page-jameson-full.png` |
| Shipment Options section | `reports/regression/shipment-options-section.png` |
| Price + Delivery + Shipment combined | `reports/regression/price-delivery-and-shipment-options.png` |

### Technical Details

- Widget container: Shipment Options uses `vc-chip` components with `--color--accent` and `--variant--solid-light` variants
- Badge background: `rgb(229, 245, 250)` (light blue)
- Badge icon: `rgb(27, 120, 155)` (teal) with truck SVG
- Container scrollHeight equals clientHeight (402px) -- no scroll mechanism present
- "You'll be notified" button replaces Add to Cart for out-of-stock products
- Quantity stepper is correctly hidden

---

## Impact

- **User Experience:** Customers see active delivery options for unavailable products, creating false expectations
- **Visual:** Content breaking out of widget container looks broken/unpolished
- **Trust:** Contradictory signals (can't buy but can pick up?) erode customer trust

---

## Suggested Fix

1. **CSS Fix:** Add `overflow: hidden` or `overflow-y: auto` to the Shipment Options widget container to prevent content overflow
2. **Business Logic Fix:** Hide or disable shipment options when product stock is 0
3. **UX Fix:** Add an explicit "Out of Stock" badge/label to the product page
4. **Data Fix:** Clean up location names (remove internal identifiers, fix typos)

---

## References

- **JIRA Ticket:** [VCST-4556](https://virtocommerce.atlassian.net/browse/VCST-4556)
- **Test Case:** FR-B2C-VAR-002 (Product Variations - Out of Stock Handling)
- **Regression Suite:** `regression/suites/13-b2c-features-tests.csv`
- **Regression Report:** `reports/regression/VCST-4556-full-regression-report-2026-02-06.md`
