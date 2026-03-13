# Pairwise — Product Toggle Combinations (8 factors)

Source: `knowledge/products.md` sections 1, 3, 6 + `test-data/products/configurable-products.csv`

## Factors

| # | Factor | Values |
|---|--------|--------|
| F1 | Product type | `Physical`, `Configurable`, `Digital` |
| F2 | Configuration section | `None`, `Product`, `Variation`, `Text`, `File` |
| F3 | Section required? | `Required`, `Optional` (shows "None" option) |
| F4 | Has variations? | `Yes`, `No` |
| F5 | In stock? | `In stock`, `Out of stock` |
| F6 | Sale price active? | `Yes` (list vs sale), `No` (list only) |
| F7 | Promo/coupon applied? | `None`, `Auto discount`, `Coupon code` |
| F8 | isActive / isBuyable | `Active+Buyable`, `Active+NotBuyable`, `Inactive` |

**Full combination:** 3 x 5 x 2 x 2 x 2 x 2 x 3 x 3 = **2,160**. Pairwise reduces to **~25-30 test cases**.

## Sample Pairwise Rows (mapped to real QA products)

| TC | F1: Type | F2: Section | F3: Required | F4: Variations | F5: Stock | F6: Sale | F7: Promo | F8: State | Test Product |
|----|----------|-------------|-------------|---------------|-----------|----------|-----------|-----------|--------------|
| 1 | Configurable | Text | Required | No | In stock | Yes | None | Active+Buyable | Base product EN (CFG-006) |
| 2 | Configurable | File | Required | No | In stock | Yes | None | Active+Buyable | Hoodie Base req (CFG-005) |
| 3 | Configurable | File | Optional | No | In stock | No | Coupon | Active+Buyable | Hoodie Base opt (CFG-004) |
| 4 | Configurable | Product | Required | No | In stock | No | Auto discount | Active+Buyable | Configurable Hat (CFG-001) |
| 5 | Configurable | Variation | Required | Yes | In stock | No | None | Active+Buyable | Bike with options (CFG-009) |
| 6 | Physical | None | — | Yes | In stock | Yes | Coupon | Active+Buyable | Baggy Regular Jeans |
| 7 | Physical | None | — | No | Out of stock | Yes | None | Active+NotBuyable | Product No variations (CFG-007, stock=0) |
| 8 | Digital | None | — | No | In stock | No | Auto discount | Active+Buyable | UNTUCKit eGift Card |
| 9 | Configurable | Text | Optional | Yes | Out of stock | No | Coupon | Active+NotBuyable | Bike w/ options (stock=0 scenario) |
| 10 | Physical | None | — | Yes | In stock | No | None | Inactive | Any deactivated product |

## PICT Input Format

```
Product_Type:    Physical, Configurable, Digital
Section:         None, Product, Variation, Text, File
Required:        Required, Optional
Has_Variations:  Yes, No
In_Stock:        InStock, OutOfStock
Sale_Price:      Yes, No
Promo:           None, AutoDiscount, CouponCode
State:           ActiveBuyable, ActiveNotBuyable, Inactive

# Constraints
IF [Product_Type] = "Physical" THEN [Section] = "None";
IF [Product_Type] = "Digital"  THEN [Section] = "None";
IF [Section] = "None"          THEN [Required] = "Required";
IF [State] = "Inactive"        THEN [In_Stock] = "OutOfStock";
IF [Section] = "Variation"     THEN [Has_Variations] = "Yes";
```
