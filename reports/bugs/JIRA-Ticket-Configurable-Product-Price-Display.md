# JIRA Ticket - Ready for Manual Entry

**Created:** 2026-02-03
**Status:** Ready to submit

---

## Ticket Details

| Field | Value |
|-------|-------|
| **Project** | VCST |
| **Issue Type** | Bug |
| **Priority** | Medium |
| **Labels** | `ux`, `cart`, `configurable-products` |
| **Components** | Storefront, Cart |

---

## Summary

Configurable Product Cart - Unclear configuration display causes apparent price discrepancy

---

## Description (JIRA Markup Format)

```
h2. Environment
* URL: https://virtostart-demo-store.govirto.com
* Product: Bike with options (SKU: ZER-64605169)
* Browser: Chrome (latest)

h2. Problem Statement
When viewing a configurable product and comparing to cart, prices appear different due to cart containing a different configuration than the current PDP selection. This is not clearly communicated to the user.

* Product page shows: $695.00 (sale) / $1,035.00 (list) with default options
* Cart shows: $683.00 (sale) / $1,058.00 (list)

h2. Steps to Reproduce
# Navigate to [Bike with Options|https://virtostart-demo-store.govirto.com/products-with-options/build-the-bike-of-your-dreams/bike-with-options]
# Note the displayed price with default options
# Check cart (if item already exists with different config)
# Compare prices - they differ because cart has different configuration

h2. Expected Behavior
* Cart should clearly display which options/components are selected
* Users should easily understand why cart price differs from current PDP selection

h2. Actual Behavior
* Cart shows price but components list is collapsed by default
* No visual indicator that cart item has different options than PDP default

h2. Technical Analysis
* API calculations are CORRECT (verified via GraphQL traces)
* CreateConfiguredLineItem mutation correctly recalculates prices
* Issue is UX clarity, not pricing logic

h2. Recommendation
* Expand components/options by default in cart for configurable products
* Or add visual indicator showing "Configuration differs from current selection"

h2. Evidence
Screenshots and API traces available in repository: reports/bugs/
* Screenshots: reports/bugs/screenshots/
* API Traces: reports/bugs/api-traces/
```

---

## Description (Markdown Format - for reference)

### Environment
- **URL:** https://virtostart-demo-store.govirto.com
- **Product:** Bike with options (SKU: ZER-64605169)
- **Browser:** Chrome (latest)

### Problem Statement
When viewing a configurable product and comparing to cart, prices appear different due to cart containing a different configuration than the current PDP selection. This is not clearly communicated to the user.

| Location | Sale Price | Original Price |
|----------|-----------|----------------|
| Product Page | $695.00 | $1,035.00 |
| Cart Page | $683.00 | $1,058.00 |
| **Difference** | $12.00 | $23.00 |

### Steps to Reproduce
1. Navigate to [Bike with Options](https://virtostart-demo-store.govirto.com/products-with-options/build-the-bike-of-your-dreams/bike-with-options)
2. Note the displayed price with default options
3. Check cart (if item already exists with different config)
4. Compare prices - they differ because cart has different configuration

### Expected Behavior
- Cart should clearly display which options/components are selected
- Users should easily understand why cart price differs from current PDP selection

### Actual Behavior
- Cart shows price but components list is collapsed by default
- No visual indicator that cart item has different options than PDP default

### Technical Analysis
- API calculations are **CORRECT** (verified via GraphQL traces)
- `CreateConfiguredLineItem` mutation correctly recalculates prices
- Issue is UX clarity, not pricing logic

### Recommendation
1. Expand components/options by default in cart for configurable products
2. Or add visual indicator showing "Configuration differs from current selection"

---

## Related Files

| Type | Path |
|------|------|
| Bug Report | `reports/bugs/BUG-Pricing-Discrepancy-Configurable-Bike-Product.md` |
| Screenshots | `reports/bugs/screenshots/` |
| API Traces | `reports/bugs/api-traces/` |

### Screenshots
- `product-page-bike-with-options.png`
- `product-page-all-options-expanded.png`
- `product-page-with-alnac-wheels-selected.png`
- `cart-page-bike-with-options.png`
- `cart-page-components-expanded.png`
- `cart-page-bike-pricing.png`

### API Trace Files
- `graphql-product-request-460.json`
- `graphql-product-response-460.json`
- `graphql-option-change-request-546.json`
- `graphql-option-change-response-546.json`
- `graphql-cart-request-636.json`
- `graphql-cart-response-636.json`
- `graphql-cart-full-request-733.json`
- `graphql-cart-full-response-733.json`
