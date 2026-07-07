# Pairwise — Store Settings Toggles

Store-level settings in Store → Settings that affect product display and purchase flow.

## Factors

| # | Factor | Values |
|---|--------|--------|
| F1 | BOPIS (Buy Online Pick Up In Store) | Enabled, Disabled |
| F2 | Wishlist | Enabled, Disabled |
| F3 | Product reviews | Enabled, Disabled |
| F4 | Product comparison | Enabled, Disabled |
| F5 | Multi-currency | Enabled (2+ currencies), Single currency |
| F6 | Inventory tracking | Track inventory, Do not track |
| F7 | Tax calculation | Tax inclusive, Tax exclusive |

**Full combination:** 2^7 = **128**. Pairwise reduces to **~12-15 test cases**.

## Sample Pairwise Rows

| TC | BOPIS | Wishlist | Reviews | Compare | Currency | Inventory | Tax | Key Verification |
|----|-------|----------|---------|---------|----------|-----------|-----|-----------------|
| 1 | On | On | On | On | Multi | Track | Inclusive | All features visible, full UI |
| 2 | On | Off | Off | Off | Single | No track | Exclusive | BOPIS pickup option appears, others hidden |
| 3 | Off | On | Off | On | Multi | Track | Exclusive | No pickup option, wishlist + compare shown |
| 4 | Off | Off | On | Off | Single | Track | Inclusive | Only reviews visible on PDP |
| 5 | On | On | Off | Off | Multi | No track | Inclusive | No "Out of stock" (no tracking), wishlist works |
| 6 | Off | Off | Off | On | Multi | No track | Exclusive | Minimal PDP — only compare feature |
| 7 | On | Off | On | On | Single | Track | Inclusive | BOPIS + reviews + compare, single currency |
| 8 | Off | On | On | Off | Single | No track | Exclusive | Wishlist + reviews, no inventory badges |

**What to verify per row:** PDP UI elements match toggle state, cart/checkout flow respects BOPIS toggle, price display matches tax mode, currency switcher visible only when multi-currency enabled, "Out of stock" badge only when inventory tracking is on.
