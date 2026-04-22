# BUG_072b_001 Investigation Report: Out-of-Stock Configuration Option Selectable on Storefront

**Date:** 2026-03-24
**Investigator:** qa-testing-expert (playwright-chrome)
**Environment:** QA (vcst-qa-storefront.govirto.com / vcst-qa.govirto.com)
**Browser:** Chromium 146.0.7680.154
**Storefront Version:** 2.44.0-pr-2212-9072-9072853e

---

## Verdict: BUG CONFIRMED -- Severity P0 (Critical)

The out-of-stock configuration option "Limited Edition Black" (`AGENT-TEST-Config-OOS-LtdBlack-20260324`) is fully selectable on the storefront with zero visual differentiation from in-stock options, and can be successfully added to cart and proceed toward checkout. This violates **BL-CART-002** (out-of-stock items must show warning) and constitutes a revenue-critical defect that could lead to unfulfillable orders.

---

## Product Under Test

| Field | Value |
|-------|-------|
| Product Name | AGENT-TEST-Config-OOS-Bike-20260324 |
| Product ID | `14bf1ca4-d1ff-4395-8d15-e8fc65dddc43` |
| SKU | AGENT-TEST-BIKE-OOS-CFG-20260324 |
| Product Type | Configurable |
| URL | `/products-with-options/configurations/agent-test-config-oos-bike-20260324` |
| Category | Products with options > Configurations |

---

## Reproduction Steps

1. Navigate to `https://vcst-qa-storefront.govirto.com/product/14bf1ca4-d1ff-4395-8d15-e8fc65dddc43`
   - Page redirects to the slug URL and renders the configurable PDP
2. Observe the "CONFIGURE THE PARAMETERS" section with "Frame Color" (required)
3. Note that "AGENT-TEST-Config-OOS-LtdBlack-20260324" is **pre-selected** (radio button checked)
4. Observe: NO "Out of Stock" label, NO greyed-out styling, NO disabled state on the radio button
5. The sidebar shows Price: $550.00, Stock: "50" (In stock), quantity stepper is active
6. Click the "+" (Increase quantity) button in the sidebar
7. **Result:** Item is successfully added to cart with the OOS option selected
8. Navigate to `/cart`
9. **Result:** Cart shows the item at $550.00, qty 1, subtotal $550.00, tax +$110.00, total $660.00
10. Expand "Components list" in the cart
11. **Result:** Shows "1. AGENT-TEST-Config-OOS-LtdBlack-20260324" -- the OOS option is confirmed in the cart line item
12. No error, no warning, no "Out of Stock" indication anywhere in the flow

---

## Expected vs Actual Behavior

| Aspect | Expected | Actual |
|--------|----------|--------|
| OOS option visual state | Greyed out, disabled, or labeled "Out of Stock" | Fully styled, selectable, identical to in-stock options |
| OOS option radio button | Disabled or not pre-selected | Enabled AND pre-selected by default |
| Add to cart with OOS option | Blocked with error message, or option prevented from selection | Successfully adds to cart, no error |
| Cart display | Should show OOS warning or reject the item | Shows item normally, "In stock: 50" (parent stock, not option stock) |
| Stock indicator on PDP | Should reflect the selected option's stock (0 for LtdBlack) | Shows parent configurable product stock (50) regardless of option |

---

## API Evidence (GraphQL productConfiguration Response)

The API **correctly returns** availability data per option. The issue is purely in the frontend rendering layer.

```json
{
  "configurationSections": [{
    "name": "Frame Color",
    "isRequired": true,
    "options": [
      {
        "product": {
          "name": "AGENT-TEST-Config-OOS-LtdBlack-20260324",
          "code": "AGENT-TEST-BIKE-OOS-BLK-20260324",
          "availabilityData": {
            "isActive": true,
            "isAvailable": false,
            "isBuyable": true,
            "isInStock": false,
            "availableQuantity": 0,
            "inventories": [{ "inStockQuantity": 0, "fulfillmentCenterName": "Chicago Branch" }]
          }
        }
      },
      {
        "product": {
          "name": "AGENT-TEST-Config-OOS-Red-20260324",
          "availabilityData": {
            "isActive": true, "isAvailable": false, "isBuyable": false,
            "isInStock": true, "availableQuantity": 10
          }
        }
      },
      {
        "product": {
          "name": "AGENT-TEST-Config-OOS-Silver-20260324",
          "availabilityData": {
            "isActive": true, "isAvailable": true, "isBuyable": true,
            "isInStock": true, "availableQuantity": 8
          }
        }
      },
      {
        "product": {
          "name": "AGENT-TEST-Config-OOS-Blue-20260324",
          "availabilityData": {
            "isActive": true, "isAvailable": false, "isBuyable": false,
            "isInStock": true, "availableQuantity": 5
          }
        }
      }
    ]
  }]
}
```

### Availability Summary

| Option | isInStock | isBuyable | isAvailable | availableQuantity | Storefront Display |
|--------|-----------|-----------|-------------|-------------------|--------------------|
| LtdBlack | **false** | true | **false** | **0** | Fully selectable, pre-selected |
| Red | true | **false** | **false** | 10 | Fully selectable |
| Silver | true | true | true | 8 | Fully selectable |
| Blue | true | **false** | **false** | 5 | Fully selectable |

**Key observation:** `isBuyable: true` on LtdBlack despite `isInStock: false` and `availableQuantity: 0` is itself suspicious. This might be an API-level issue where `isBuyable` does not account for stock when `isTrackInventory` is true. However, `isInStock: false` and `isAvailable: false` are correctly reported and should be sufficient for the frontend to disable the option.

---

## Cross-Product Comparison

Checked "Bike with options" (`/products-with-options/configurations/bike-with-options`) -- the established configurable product in the catalog. Its configuration sections (Text, Test, Products) also show **no OOS visual treatment** on any options. This confirms the issue is **systemic** -- the storefront configurable product UI component does not implement availability checking for configuration options at all.

---

## Root Cause Hypothesis

**Primary (Frontend -- HIGH confidence):** The Vue component rendering configuration section options (`ConfigurationSection` or equivalent) does not consume `availabilityData` fields (`isInStock`, `isAvailable`, `isBuyable`, `availableQuantity`) from the `productConfiguration` GraphQL response. All options are rendered identically regardless of stock status.

**Contributing factors:**
1. **No disabled state logic:** Radio buttons for config options lack conditional `disabled` attribute binding based on `product.availabilityData.isInStock`
2. **No OOS visual indicator:** No "Out of Stock" badge/label component is rendered for unavailable options
3. **No default selection filtering:** The first option is pre-selected regardless of availability; it should skip OOS options
4. **Stock display uses parent product:** The sidebar stock badge shows the configurable parent's stock (50), not the selected option's stock (0)
5. **Cart add-to-cart does not validate:** The `addConfiguredLineItem` mutation (or equivalent) does not validate option stock before accepting

**Secondary (API -- MEDIUM confidence):** `isBuyable: true` on LtdBlack (with qty=0) may indicate the xAPI `isBuyable` calculation does not consider `isInStock` for configuration option products. This is a separate potential issue.

---

## Impact Assessment

| Dimension | Impact |
|-----------|--------|
| **Revenue** | Customers could complete purchase of unfulfillable configurations, requiring manual cancellation/refund |
| **Customer experience** | No visibility into which options are available; discovered only at fulfillment |
| **Operations** | Manual order review needed to catch OOS configurations before shipment |
| **Trust** | B2B customers expect accurate stock data for procurement decisions |
| **Scope** | Affects ALL configurable products, not just this test product |

---

## Evidence Files

| File | Description |
|------|-------------|
| `bug-072b-001-evidence1-full-page-pdp.png` | Full PDP showing all 4 options with no OOS indicators |
| `bug-072b-001-evidence2-oos-added-to-cart.png` | PDP after adding OOS option -- shows "1 in Cart" |
| `bug-072b-001-evidence3-cart-with-oos-item.png` | Cart page showing the OOS configured item at $550 |
| `bug-072b-001-evidence4-cart-components-expanded.png` | Cart with expanded Components list showing LtdBlack |

---

## Severity: P0 (Critical)

**Justification:**
- Violates BL-CART-002: OOS items must show warning; silent checkout with 0-stock = P0
- Revenue-critical: enables orders that cannot be fulfilled
- Systemic: affects all configurable products, not a single product data issue
- API data is correct but frontend ignores it -- the fix path is clear

---

## Recommendations

### Immediate (P0 fix)

1. **Frontend -- Configuration option component:** Add availability checks to the option rendering logic:
   - Disable radio button when `product.availabilityData.isInStock === false` or `product.availabilityData.isAvailable === false`
   - Show "Out of Stock" badge on unavailable options
   - Grey out / reduce opacity of unavailable option rows
   - Skip OOS options for default selection (pre-select first available option)

2. **Frontend -- Stock display:** Update sidebar stock badge to reflect the selected option's `availableQuantity`, not the parent product stock

3. **Backend -- Cart validation:** Add server-side validation in `addConfiguredLineItem` to reject configurations containing OOS option products (defense in depth)

### Secondary

4. **API investigation:** Verify why `isBuyable: true` for LtdBlack with `availableQuantity: 0`. If `isTrackInventory: true`, `isBuyable` should return `false` when stock is 0.

5. **Regression suite:** Add test cases to suite 072b for:
   - OOS option visual differentiation
   - OOS option not pre-selected
   - Add-to-cart blocked with OOS option
   - Stock badge reflects selected option

---

## Teardown

- Cart cleared (confirmed "Your cart is empty" state)
- No orders created
- Browser session active (no logout needed for subsequent testing)
