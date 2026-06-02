# Bug Report: Configurable Product Option Displays listPrice Instead of salePrice

## Bug Summary

**Bug ID:** BUG-Config-Pricing-Display-001
**Severity:** High
**Priority:** P1
**Status:** Confirmed
**Environment:**
- URL: https://virtostart-demo-store.govirto.com/products-with-options/build-the-bike-of-your-dreams/bike-with-options
- Browser: Chrome 144.0.7559.110
- Store Version: 2.40.0
- Date Tested: 2026-02-03

---

## Issue Description

On the configurable product page for "Bike with options", the WHEELS configuration section displays the **listPrice** as the unit price instead of the **salePrice** when the product has a discount. This causes user confusion because the displayed unit price does not match the mathematical calculation shown in the subtotal.

---

## Steps to Reproduce

1. Navigate to: https://virtostart-demo-store.govirto.com/products-with-options/build-the-bike-of-your-dreams/bike-with-options
2. Observe the WHEELS configuration section (it may need to be expanded by clicking the header)
3. Look at the first wheel option: "Rear wheel, 26", double-wall rim, motorized"
4. Observe the displayed pricing information

---

## Expected Behavior

For the "Rear wheel, 26", double-wall rim, motorized" option:
- **Unit Price (Sale Price):** $65.00
- **Original Price (List Price, crossed out):** $100.00
- **Quantity:** 2
- **Subtotal (Extended Price):** $130.00 (calculated as 2 x $65.00)

The unit price should display $65.00 (the sale price), with $100.00 shown as a crossed-out original price, consistent with how sale prices are displayed in the "Products Related to This Item" section on the same page.

---

## Actual Behavior

For the "Rear wheel, 26", double-wall rim, motorized" option:
- **Displayed Unit Price:** $100.00 (incorrectly showing listPrice)
- **No crossed-out original price is shown**
- **Quantity:** 2
- **Subtotal:** $130.00 (correctly calculated as 2 x $65.00 salePrice)

The user sees:
- Unit price: $100.00
- Qty: 2
- Subtotal: $130.00

This creates the false impression that 2 x $100 = $130, which is mathematically impossible and confusing.

---

## Root Cause Analysis

### API Response Analysis

The GraphQL `GetProductConfigurations` query returns the correct pricing data:

```json
{
  "id": "75b33b03-cac2-49fc-aff1-50a2f3b34b7b",
  "quantity": 2,
  "listPrice": {
    "amount": 100.00,
    "formattedAmount": "$100.00"
  },
  "salePrice": {
    "amount": 65.00,
    "formattedAmount": "$65.00"
  },
  "extendedPrice": {
    "amount": 130.00,
    "formattedAmount": "$130.00"
  }
}
```

### Pricing Data Breakdown

| Field | Value | Description |
|-------|-------|-------------|
| listPrice | $100.00 | Original/regular price |
| salePrice | $65.00 | Discounted sale price (35% off) |
| quantity | 2 | Number of units |
| extendedPrice | $130.00 | Correctly calculated: 2 x $65.00 = $130.00 |

### UI Display Issue

The frontend component is displaying `listPrice` ($100.00) as the primary unit price instead of `salePrice` ($65.00). The `extendedPrice` is calculated correctly by the backend, but the UI creates visual inconsistency.

---

## Configurable Product Price Calculation Formula

The total price for a configurable product is calculated as:

```
Total Price = Base Product Price + Σ (Option Price × Option Quantity)
```

Where:
- **Base Product Price** = The price of the main product (uses `salePrice` if discounted, otherwise `listPrice`)
- **Option Price** = The price of each selected configuration option (should use `salePrice` when available)
- **Option Quantity** = The quantity for each option (can vary per option)

### Example Calculation for "Bike with Options"

| Component | List Price | Sale Price | Qty | Extended Price |
|-----------|------------|------------|-----|----------------|
| **Base Product** | $805.00 | $500.00 | 1 | $500.00 |
| WHEELS: Rear wheel, 26" | $100.00 | $65.00 | 2 | $130.00 (2 × $65) |
| PEDALS: Pedals | $15.00 | $15.00 | 2 | $30.00 (2 × $15) |
| SEAT: Seat (optional) | $35.00 | $35.00 | 1 | $35.00 (1 × $35) |
| **TOTAL** | **$1,035.00** | **$695.00** | - | **$695.00** |

### Calculation Breakdown

```
Total Sale Price = Base ($500) + Wheels ($65 × 2) + Pedals ($15 × 2) + Seat ($35 × 1)
                 = $500 + $130 + $30 + $35
                 = $695.00

Total List Price = Base ($805) + Wheels ($100 × 2) + Pedals ($15 × 2) + Seat ($35 × 1)
                 = $805 + $200 + $30 + $35
                 = $1,070.00 (note: displayed as $1,035 - may indicate different default config)
```

### The Display Bug Effect

Because the UI displays `listPrice` instead of `salePrice` for options:

| What User Sees | Actual Value | User's Mental Math | Correct Math |
|----------------|--------------|-------------------|--------------|
| Wheel: $100 × 2 | $65 × 2 | = $200 | = $130 |
| Subtotal shown | $130 | "That's wrong!" | ✓ Correct |

The user expects $200 (based on displayed $100) but sees $130, causing confusion even though the calculation is mathematically correct.

---

## Impact

- **User Trust:** Users may perceive this as a pricing error or attempted overcharging
- **Purchase Decision:** Users may hesitate to purchase due to apparent calculation errors
- **Support Load:** Potential increase in customer support inquiries about pricing
- **Revenue:** May lead to cart abandonment

---

## Evidence

### Screenshots

| Screenshot | Path | Description |
|------------|------|-------------|
| Initial State | `reports/bugs/screenshots/pricing-investigation-initial-state.png` | Page load state |
| WHEELS Expanded | `reports/bugs/screenshots/pricing-investigation-wheels-expanded.png` | Configuration options visible |
| Option Changed | `reports/bugs/screenshots/pricing-investigation-alnac-selected.png` | After selecting different option |

### API Traces

| File | Path | Description |
|------|------|-------------|
| Product Config Response | `reports/bugs/api-traces/graphql-req176.json` | Full GetProductConfigurations response with pricing data |

---

## Comparison with Correct Display Pattern

In the "Products Related to This Item" section on the same page, the same "Rear wheel, 26", double-wall rim, motorized" product is displayed with CORRECT pricing format:
- Sale price: $65.00 (primary, bold)
- List price: $100.00 (crossed out)

This proves the correct display pattern is already implemented elsewhere in the application.

---

## Recommended Fix

The configurable product options component should:

1. Display `salePrice` as the primary unit price when `salePrice` != `listPrice`
2. Display `listPrice` with strikethrough styling when there is a discount
3. Maintain consistency with the pricing display pattern used in other product cards

### Code Location (Confirmed)

**Repository:** https://github.com/VirtoCommerce/vc-frontend

#### File 1: `product-configuration.vue` (Parent Component)
**Path:** `client-app/shared/catalog/components/configuration/product-configuration.vue`
**Lines:** 50-62

**Current Code (Bug):**
```vue
<OptionProduct
  v-if="option.product"
  data-test-id="product-option"
  :model-value="selectedConfiguration[section.id]?.productId"
  :product="option.product"
  :quantity="option.quantity"
  :list-price="option.listPrice"
  :extended-price="option.extendedPrice"
  :name="section.id"
  @input="..."
/>
```

**Issue:** The `salePrice` prop is NOT passed to the `OptionProduct` component, even though the API returns it.

**Fix:** Add the missing prop:
```vue
<OptionProduct
  ...
  :list-price="option.listPrice"
  :sale-price="option.salePrice"        <!-- ADD THIS LINE -->
  :extended-price="option.extendedPrice"
  ...
/>
```

---

#### File 2: `option-product.vue` (Child Component)
**Path:** `client-app/shared/catalog/components/configuration/option-product.vue`
**Lines:** 54-58 (Props interface)

**Current Code (Bug):**
```typescript
interface IProps {
  product: DeepReadonly<Product>;
  quantity?: number;
  listPrice?: MoneyType;
  extendedPrice?: MoneyType;
  modelValue?: string;
  name: string;
}
```

**Issue:** No `salePrice` prop defined.

**Fix:** Add the salePrice prop:
```typescript
interface IProps {
  product: DeepReadonly<Product>;
  quantity?: number;
  listPrice?: MoneyType;
  salePrice?: MoneyType;    // ADD THIS LINE
  extendedPrice?: MoneyType;
  modelValue?: string;
  name: string;
}
```

---

#### File 2: `option-product.vue` (Template)
**Lines:** 26-31

**Current Code (Bug):**
```vue
<VcProductPrice
  :with-from-label="product.hasVariations || product.isConfigurable"
  :actual-price="extendedPrice"
  :list-price="listPrice"
/>
```

**Issue:** Uses `listPrice` for display. The `VcProductPrice` component expects `actual-price` to be the sale/discounted price and `list-price` to be the original price (shown with strikethrough when different).

**Fix:** Update to use salePrice correctly:
```vue
<VcProductPrice
  :with-from-label="product.hasVariations || product.isConfigurable"
  :actual-price="salePrice ?? listPrice"
  :list-price="salePrice && salePrice.amount !== listPrice?.amount ? listPrice : undefined"
/>
```

This ensures:
- When there's a sale price, it's displayed as the actual price
- When sale price differs from list price, list price is shown with strikethrough
- When there's no discount (salePrice === listPrice), only one price is shown

---

## Related Issues

- This may be related to the previously reported bug: `BUG-Pricing-Discrepancy-Configurable-Bike-Product.md`

---

## Test Data

- **Product SKU:** ZER-64605169
- **Product ID:** f16d3e8f-6c86-4679-bcfd-100a0b164421
- **Configuration Section ID:** 8b1fc5f5-749d-4337-a405-92fda54722a0 (Wheels)
- **Affected Option ID:** 75b33b03-cac2-49fc-aff1-50a2f3b34b7b (Rear wheel)

---

## Verification Steps (After Fix)

1. Navigate to the product page
2. Verify WHEELS option shows:
   - Unit price: $65.00 (sale price)
   - Original price: $100.00 (crossed out)
   - Quantity: 2
   - Subtotal: $130.00
3. Verify the math makes sense to the user: 2 x $65 = $130
