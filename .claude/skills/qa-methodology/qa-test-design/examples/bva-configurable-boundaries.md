# BVA — Configurable Product Boundaries

## Configuration Section Count

| Boundary | Value | Test Product | Expected |
|----------|-------|-------------|----------|
| 0 sections (not configurable) | Physical product | CFG-007 | No "Customize" button, direct "Add to Cart" |
| 1 section | Single Product section | CFG-001 (Hat) | One config step before add to cart |
| 3 sections (multi) | Text × 3 | CFG-006 (Base product EN) | All 3 sections must be filled |
| 2 mixed sections | Variation + Text | CFG-009 (Bike) | Both section types render correctly together |

## Option Price Boundaries

| Boundary | Value | Context | Expected |
|----------|-------|---------|----------|
| $0.00 option | Free add-on | Optional section with $0 option | Total = base price only, "Free" label shown |
| Cheapest option | $0.01 | Minimum priced add-on | Total = base + $0.01, rounds correctly |
| Most expensive option | $88.00 sale / $126.00 list | CFG-010 Rear Wheel | Correct price used per BL-PRICE-001 |
| Sum exceeds display width | Base $438 + options totaling $500+ | CFG-010 all options selected | No UI overflow, price formatted correctly |

## Configured Product Quantity in Cart

| Boundary | Value | Expected | BL Ref |
|----------|-------|----------|--------|
| qty = 0 | Remove configured item | Item removed, config lost | — |
| qty = 1 | Minimum | Standard behavior | — |
| qty = 2+ | Multiply configured item | Total = qty × (base + options). Config applies to all units | BL-PRICE-008 |
| qty > stock of selected option | Exceeds option stock | Rejected — option component insufficient stock | BL-CART-001 |
