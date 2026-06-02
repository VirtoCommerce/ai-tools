# BUG: GA4 `add_to_cart` event reports BASE price instead of CONFIGURED total for configurable products

**Date:** 2026-03-31
**Severity:** High (P1) -- analytics data integrity, revenue attribution
**Browser:** Firefox (Playwright MCP)
**Environment:** QA (`https://vcst-qa-storefront.govirto.com`)
**Product under test:** "Bike with options" (`/products-with-options/configurations/bike-with-options`, SKU: ZER-64605169, base price $350.00)

---

## Summary

The GA4 `add_to_cart` dataLayer event on the PDP always reports the **base product price** ($350) regardless of which configuration option is selected. When a user selects an option that adds a surcharge (e.g., Seat +$45, Rear wheel +$44), the displayed price correctly updates (to $395 or $394), but the GA4 event payload still contains the base price.

Critically, the `view_cart` event on the cart page **does** report the correct configured price, proving that the cart itself stores the correct total. The bug is isolated to the `add_to_cart` event emission on the PDP.

---

## Test Results

| Test | Config Selected | Displayed Price | GA4 `value` | GA4 `items[0].price` | Result |
|------|----------------|-----------------|-------------|----------------------|--------|
| 1 - Seat | Seat ($45 x 1) | **$395.00** | **350** | **350** | FAIL -- reports base price |
| 2 - Rear wheel | Rear wheel ($22 x 2) | **$394.00** | **350** | **350** | FAIL -- reports base price |
| 3 - None (control) | None | **$350.00** | **350** | **350** | PASS -- correct (no surcharge) |
| 4 - view_cart | Seat ($395) + None ($350) in cart | Cart: $395 + $350 = $745 | **894** (incl. tax) | **395** / **350** | PASS -- cart event correct |

---

## Raw GA4 Evidence

### Test 1: add_to_cart with Seat selected (displayed $395, reported $350)

```json
{
  "0": "event",
  "1": "add_to_cart",
  "2": {
    "source_route": "/products-with-options/configurations/bike-with-options",
    "currency": "USD",
    "value": 350,
    "items": [
      {
        "item_id": "ZER-64605169",
        "item_name": "Bike with options",
        "price": 350,
        "discount": 0,
        "quantity": 1,
        "item_category": "Catalog",
        "item_category2": "Products with options",
        "item_category3": "Configurations"
      }
    ]
  }
}
```

### Test 2: add_to_cart with Rear wheel selected (displayed $394, reported $350)

```json
{
  "0": "event",
  "1": "add_to_cart",
  "2": {
    "source_route": "/products-with-options/configurations/bike-with-options",
    "currency": "USD",
    "value": 350,
    "items": [
      {
        "item_id": "ZER-64605169",
        "item_name": "Bike with options",
        "price": 350,
        "discount": 0,
        "quantity": 1,
        "item_category": "Catalog",
        "item_category2": "Products with options",
        "item_category3": "Configurations"
      }
    ]
  }
}
```

### Test 4: view_cart (correctly reports configured prices)

```json
{
  "0": "event",
  "1": "view_cart",
  "2": {
    "currency": "USD",
    "value": 894,
    "items": [
      {
        "index": 0,
        "item_id": "Configuration-ZER-64605169",
        "item_name": "Bike with options",
        "affiliation": "?",
        "currency": "USD",
        "discount": 0,
        "price": 395,
        "quantity": 1
      },
      {
        "index": 1,
        "item_id": "Configuration-ZER-64605169",
        "item_name": "Bike with options",
        "affiliation": "?",
        "currency": "USD",
        "discount": 0,
        "price": 350,
        "quantity": 1
      }
    ],
    "items_count": 2
  }
}
```

---

## Additional Observations

1. **item_id discrepancy:** The `add_to_cart` event uses `item_id: "ZER-64605169"` (base SKU), while `view_cart` uses `item_id: "Configuration-ZER-64605169"` (prefixed with "Configuration-"). This suggests the PDP emits the event using the base product data before the configuration is applied to the cart.

2. **view_cart value includes tax:** The `view_cart` event reports `value: 894` which appears to include tax ($745 subtotal + $149 tax = $894). This is a separate concern -- GA4 best practice recommends `value` should represent the cart subtotal before tax. The cart UI shows Subtotal: $745.00 and Total: $894.00.

3. **Root cause hypothesis:** The `add_to_cart` event is fired using the product's `listPrice` or `salePrice` from the product object on the PDP, rather than reading the dynamically computed configured total from the Price and Delivery panel. The event handler likely fires before or independently of the configuration price calculation.

---

## Impact

- **Revenue underreporting in GA4:** Every configurable product add-to-cart is tracked at the base price, causing systematic underreporting in:
  - GA4 Monetization > E-commerce purchases funnel
  - Google Ads conversion value (if using GA4 as source)
  - Any downstream analytics that uses add_to_cart value for funnel analysis
- **Funnel discrepancy:** add_to_cart reports lower values than view_cart and purchase events for the same items, creating inconsistent funnel metrics.

---

## Steps to Reproduce

1. Navigate to `{FRONT_URL}/products-with-options/configurations/bike-with-options`
2. Open "Section with products" accordion
3. Select "Seat" radio button -- verify displayed price updates to $395.00
4. Click "Add to cart"
5. Execute in browser console: `JSON.stringify(window.dataLayer.filter(e => e[1] === 'add_to_cart'), null, 2)`
6. Observe: `value` and `items[0].price` are both `350`, not `395`

## Expected Behavior

The `add_to_cart` event should report `value: 395` and `items[0].price: 395` when the configured total is $395.

## Suggested Fix

The GA4 event emission for `add_to_cart` on configurable product PDPs should read the computed total price (base + option surcharges) rather than the base product price. The `view_cart` event already does this correctly, so the cart-side data model is accurate -- only the PDP-side event emission needs to be updated.

---

## Screenshots

- `test1-seat-selected-price.png` -- PDP showing $395.00 with Seat selected
- `test1-seat-after-add-to-cart.png` -- PDP after add to cart, price still $395.00
- `test2-rearwheel-selected-price.png` -- PDP showing $394.00 with Rear wheel selected
- `test4-view-cart-with-both-items.png` -- Cart page showing $395 + $350 items
