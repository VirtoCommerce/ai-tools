# Test Data: VCST-4553 - Predefined Product List Block

## Environment Verification
- **PR Deployed:** YES
- **Version:** 2.41.0-pr-2165-b9ab-b9ab1fa9
- **Frontend URL:** https://vcst-qa-storefront.govirto.com
- **Verified:** 2026-02-05

---

## Valid Product SKUs (QA Environment)

### Primary Test SKUs (12 products for max limit testing)

| # | SKU | Product Name | Category | Price | Stock |
|---|-----|--------------|----------|-------|-------|
| 1 | `6022122` | DOUWE EGBERTS COCOA FANTASY BLUE BAG 1.0KG | Coffee | $233.00 | 7311 |
| 2 | `DXT-94128101` | LAYS CHIPS PAPRIKA BOX 20X40GR | Snacks | $57.00 | 62 |
| 3 | `CJ-229032` | CAPRI-SUN MULTIVITAMIN POUCH BOX 4X10X0,20L | Juice | $12.20 | 1 |
| 4 | `15071125544` | EN Coca Cola Regular 6x330ml EN | Soft Drinks | $25.00 | In stock |
| 5 | `GIH-99953267` | Fanta Orange Bottle 500ml | Soft Drinks | $7,777.00 | 715 |
| 6 | `271507` | New MONIN SYRUP CARAMEL BOTTLE 0,70L | Juice | $24.00 | 13 |
| 7 | `1592321634` | Coca Cola Regular Retail Pack Cans 24x330ml | Soft Drinks | $14.00 | 5806 |
| 8 | `FAJ-47346468` | Fanta Orange Bottle 330ml | Soft Drinks | $8.20 | 9999+ |
| 9 | `0003420` | Fanta Mango Soda 6x330ml | Soft Drinks | $12.20 | 9999+ |
| 10 | `0003428` | New Fanta Peach Soda 6x330ml | Soft Drinks | $8.00 | 86 |
| 11 | `ZCA-20978616` | Coca Cola Cherry Can 8x330ml | Soft Drinks | $12.20 | - |
| 12 | `MBY-88916331` | Digital promo Coco-Cola catalog | Soft Drinks | $45.00 | Digital |

### Additional Test SKUs

| SKU | Product Name | Notes |
|-----|--------------|-------|
| `6052259` | OREO COOKIES ORIGINAL BOX 20X66GR | Snacks |
| `605236` | DORITOS NACHO BOX 20X44GR | Snacks |
| `6052137` | New BALISTO MUESLI MIX GREEN BOX 20X37GR | Snacks |
| `UBK-42890220` | Snack day Flips peanuts | Snacks |
| `BAS-05562315` | EN Acqua Minerale Naturale mineral water 12x2Lt | Mineral Water |
| `UVH-58002525` | Borjomi Mineral Water | Mineral Water |

---

## Special Test Cases SKUs

### Out of Stock Product
- **SKU:** Look for products with "OUT-OF-STOCK" in name or 0 stock

### Low Stock Product
- **SKU:** `CJ-229032` (Stock: 1)

### High Price Product
- **SKU:** `GIH-99953267` ($7,777.00)

### Digital Product
- **SKU:** `MBY-88916331` (Digital promo catalog)

### Product with Discount
- **SKU:** `DXT-94128101` (36% off)
- **SKU:** `FAJ-47346468` (37% off)

---

## Invalid SKUs (for negative testing)

| SKU | Description |
|-----|-------------|
| `NON-EXISTENT-SKU-999` | Does not exist in catalog |
| `INVALID-FORMAT` | Invalid format |
| `` (empty) | Empty string |
| `12345` | Random number (may not exist) |

---

## Test Scenarios with Specific SKUs

### Scenario 1: Basic 3 Products
```
SKUs: 6022122, DXT-94128101, 15071125544
```

### Scenario 2: Maximum 12 Products
```
SKUs: 6022122, DXT-94128101, CJ-229032, 15071125544, GIH-99953267,
      271507, 1592321634, FAJ-47346468, 0003420, 0003428,
      ZCA-20978616, MBY-88916331
```

### Scenario 3: Single Product
```
SKU: 6022122
```

### Scenario 4: Mixed Categories
```
SKUs: 6022122 (Coffee), DXT-94128101 (Snacks), 15071125544 (Soft Drinks), CJ-229032 (Juice)
```

### Scenario 5: Reordering Test
```
Initial Order: 6022122, DXT-94128101, 15071125544, CJ-229032
Expected After Reorder: CJ-229032, 6022122, 15071125544, DXT-94128101
```

### Scenario 6: Invalid SKU Mixed with Valid
```
SKUs: 6022122, NON-EXISTENT-SKU-999, 15071125544
Expected: 2 products display, invalid SKU handled gracefully
```

---

## Builder.io Configuration Values

### Title/Subtitle Test Values
- **Title:** "Featured Campaign Products"
- **Subtitle:** "Exclusive deals for February 2026"

### Special Characters Title
- **Title:** "50% OFF! Save $100+ on Featured Items™"
- **Subtitle:** "Limited time <offer> & exclusive deals"

### Card Type Options
- `full` - Full product card (image, name, price, description, add to cart)
- `short` - Short product card (image, name, price only)

### Column Settings
- **Tablet:** 2 or 3 columns
- **Desktop:** 3 or 4 columns

---

## Product URLs for Manual Verification

| SKU | Product Page URL |
|-----|------------------|
| 6022122 | /coffee-and-tea/coffee/douwe-egberts-cocoa-fantasy-blue-bag-10kg |
| DXT-94128101 | /snacks/chips/lays-chips-paprika-box-20x40gr |
| CJ-229032 | /juice/juice-syrup/capri-sun-multivitamin-pouch-box-4x10x020l |
| 15071125544 | /soft-drinks/soda/coca-cola-regular-6x330ml |

---

## Notes

1. **SKU Format:** SKUs in QA environment vary in format (numeric, alphanumeric with prefixes)
2. **Stock Levels:** Verify stock levels before testing as they may change
3. **Pricing:** Some products have discounts - verify original vs sale price
4. **Digital Products:** Some products are digital (no physical shipping)
5. **Min Quantity:** Some products have minimum order quantities

---

*Last Updated: 2026-02-05*
*Environment: VCST QA*
