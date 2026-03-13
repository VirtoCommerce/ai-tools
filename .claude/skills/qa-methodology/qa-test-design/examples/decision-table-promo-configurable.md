# Decision Table — Promo x Configurable Product Pricing

Covers **BL-PRICE-001** (discount stacking order) interaction with configurable product sections. High revenue risk.

## Conditions

| # | Condition | Values |
|---|-----------|--------|
| C1 | Section type | Product, Variation, Text, File, None |
| C2 | Sale price active? | Yes, No |
| C3 | Promo type | None, Auto discount, Coupon, Auto + Coupon |

## Rules

| Rule | C1: Section | C2: Sale? | C3: Promo | Expected Price Calculation | Test Product |
|------|-------------|-----------|-----------|----------------------------|-------------|
| R1 | Product (option $88 sale) | Yes | None | Base + option sale price | Test Bike (CFG-010) |
| R2 | Product (option $126 list) | No | 10% coupon | Base + $126 - 10% of (base+$126) | Test Bike (CFG-010) |
| R3 | Product (option $88 sale) | Yes | 10% coupon | Base + $88 - 10% of (base+$88). **NOT** 10% of list $126 | Test Bike (CFG-010) |
| R4 | Text (no price impact) | Yes | Auto $5 off | Sale price - $5 | Base product EN (CFG-006) |
| R5 | File (no price impact) | No | Coupon | List price - coupon | Hoodie Base opt (CFG-004) |
| R6 | Variation (BIKE-RED-M) | No | Auto + Coupon | Per BL-CART-003: coupon replaces auto under BestRewardPolicy | Bike with options (CFG-009) |
| R7 | None (simple physical) | Yes | Auto + Coupon | Same BestReward policy — coupon-backed reward wins | Any simple product |

**Key invariant (BL-PRICE-001):** Discounts apply in order: (1) catalog sale price replaces list, (2) tier/volume at threshold, (3) coupon/promo on already-discounted amount — never on original list price.

**Known behavior (BL-CART-003):** Under `BestRewardPromotionPolicy`, coupon-backed `CartSubtotalReward` always replaces auto-applied reward, even if coupon discount is smaller. This is by design.
