# Error Guessing — Configurable Product Edge Cases

VC-specific failure scenarios. Apply after EP + BVA to catch the remaining ~40% of defects.

## Configuration Interaction Errors

| # | Scenario | What Could Break | Test Product |
|---|----------|-----------------|-------------|
| EG-1 | Select option, navigate away (browser back), return to PDP | Configuration state lost — user must re-select all options | CFG-001, CFG-010 |
| EG-2 | Rapidly click between radio options in Product section | Price calculation race condition — displayed price lags behind selection | CFG-010 (2 Product sections) |
| EG-3 | Add configured product to cart, open "Edit configuration" and cancel without changing | Config should remain unchanged — watch for reset to defaults | CFG-001 |
| EG-4 | Configure product in two browser tabs, submit different configs | Cart may contain unexpected config or duplicate line items | CFG-006 (3 Text sections) |
| EG-5 | Fill all 3 Text sections with max-length text, add to cart | Cart line item display overflow, order confirmation email truncation | CFG-006 |
| EG-6 | Upload file, immediately click "Add to Cart" before upload completes | Race: item added with no file attached despite required=true | CFG-005 |
| EG-7 | Select Variation option (BIKE-RED-M), then switch store currency | Variation price should recalculate from new currency's price list, not convert | CFG-009, BL-CART-004 |
| EG-8 | Add configured product to cart, admin deletes the selected option from catalog | Cart should flag invalid config — not show $0 or crash | CFG-010 |

## Search Index & Cache Timing

| # | Scenario | What Could Break | BL Ref |
|---|----------|-----------------|--------|
| EG-9 | Admin creates new configurable product, user searches immediately | Product not in Elasticsearch yet (30-60s lag) | — |
| EG-10 | Admin changes section from required to optional, user has PDP open | Stale page still enforces required — needs refresh | — |
| EG-11 | Admin changes option price, user has product in cart | Cart shows old price until recalculation/refresh | BL-PRICE-001 |

## Promotion Edge Cases with Configurable Products

| # | Scenario | What Could Break | BL Ref |
|---|----------|-----------------|--------|
| EG-12 | Apply coupon, then edit configuration to cheaper option | Coupon may now exceed item value — negative line total? | BL-PRICE-001 |
| EG-13 | Configurable product with $0 base price + paid options + % coupon | Coupon % applied to $0 base = $0 discount, user expects discount on options too | BL-PRICE-001 |
| EG-14 | Auto promo targets category, configurable product spans categories via options | Promo may apply to base but not option products (different categories) | BL-CART-003 |
| EG-15 | Buy 2 get 1 free promo + configured product with qty=3 | Does free item include configuration cost or just base price? | BL-PRICE-001 |
