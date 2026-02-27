# Integration Test Cases

> Reference file for qa-backend-expert agent. Read when testing cross-module integrations.

## 1. Pricing ↔ Storefront Integration (from 19-pricing-tests.csv)

```markdown
# PRICE-009: Change price on Backend → Price updated on Storefront
1. Backend: Catalog > Product > Price widget → change price value → Save
2. Rebuild search index
3. Storefront: Open same product → verify price matches backend change
✅ Price updated on storefront

# PRICE-010: Remove price → Storefront shows $0 and Unavailable
1. Backend: Delete all prices from product → Save
2. Rebuild search index
3. Storefront: Price = 0, 'Unavailable' label shown, cannot add to cart
✅ Product correctly marked unavailable

# PRICE-011: Price with highest priority shown on Storefront
1. Set priority of priceList_1 higher than priceList_2 → storefront shows priceList_1 price
2. Swap priorities → storefront shows priceList_2 price
✅ Priority controls which price is displayed

# PRICE-013: Price changed when switching currency (USD/EUR)
1. USD selected → product shows USD price from USD pricelist
2. Switch to EUR → product shows EUR price from EUR pricelist
✅ Currency-specific pricelists work correctly

# PRICE-019: Verify pricelist assignment via GraphQL xAPI
query { products(storeId: "mystore1", productIds: "<id>") {
  items { name prices { list { formattedAmountWithoutPoint } pricelistId } }
}}
✅ Response contains correct price from assigned pricelist

# PRICE-024: Tiered pricing in cart (complex integration)
Product with tiers: qty=1 ($349/$210), qty=4 ($100), qty=10 ($88/$69)
- Cart qty=1 → list/sale = 349/210
- Cart qty=4 → new price 100, discount = (349-100)×4
- Cart qty=10 → new price 69, discount = (349-69)×10
✅ Discount recalculates correctly per tier at each quantity
```

## 2. Inventory ↔ Storefront Integration (from 22-inventory-tests.csv)

```markdown
# INV-019: Order product → stock qty decreased
1. Backend: Note 'In stock' qty = X
2. Storefront: Order product (qty=1)
3. Backend: 'In stock' = X-1
✅ Stock decremented after order (Track inventory = TRUE)

# INV-020: Order more items than available → warning
1. Backend: Set 'In stock' = X
2. Storefront: Add product, set qty = X+1
3. Warning: "Product quantity exceeded! Available quantity is: X"
✅ Validation prevents over-ordering

# INV-021: Available items from multiple FFCs
1. Default FFC stock = X, Available FFC stock = Y
2. Storefront: qty = X+Y → no warning (combined inventory)
3. qty = X+Y+1 → warning shown
✅ Multiple fulfillment center stock aggregated

# INV-022: In stock = 0 → item unavailable
1. 'Add to cart' button inactive in details view
2. No 'Add to cart' button in list view
3. 'Sold out' label on item image
✅ Zero-stock items properly blocked

# INV-023: Add to cart → Backend reduces stock to 0 → Create order fails
1. Storefront: Add product to cart
2. Backend: Update inventory to 0
3. Storefront: Try to create order → validation error
✅ Real-time inventory validation at checkout
```

## 3. Order ↔ Inventory Integration (from 20-orders-tests.csv)

```markdown
# ORD-028: Cancel order → adjust stock for single product FFC
Preconditions: 'Adjust inventory for orders' enabled, Track inventory = TRUE
1. Note current 'In stock' qty for product in Default FFC
2. Cancel the order
3. Verify stock increased by cancelled order quantity
✅ Stock restored on cancellation

# ORD-029: Cancel order → adjust stock for multiple FFCs and products
1. Order has products from different FFCs
2. Cancel → verify stock adjusts for each product in respective FFC
✅ Multi-FFC stock adjustment works

# ORD-030: Non-cancelled status → stock doesn't change
1. Set Payment status = Cancelled (not order) → stock unchanged
2. Set Shipment status = Cancelled (not order) → stock unchanged
✅ Only full order cancellation triggers stock adjustment
```

## 4. Search Index Integration (from 26-search-indexing-tests.csv)

```markdown
# SRCH-015: Create product then refresh index
1. Create new product
2. Navigate to Search Index → Refresh
✅ New product reflected in index after rebuild

# SRCH-016: Delete product then rebuild index
1. Delete a product
2. Rebuild index
3. Search for deleted product
✅ Deleted product no longer appears in search results

# SRCH-008: Rebuild index (blue-green)
1. Navigate to Search Index → Click Rebuild
2. Verify both active and inactive indices built
✅ Both indices updated successfully

# SRCH-010: Swap indexes (blue-green deployment)
1. Click Swap Indexes
✅ Active and inactive indices swapped successfully

# SRCH-028 to 035: Search Filters API
□ SRCH-028: Single TermFilter → results filtered by single term
□ SRCH-029: Multiple TermFilters → AND logic applied
□ SRCH-030: OrFilter → products matching ANY condition returned
□ SRCH-031: AndFilter with nested OrFilter → complex logic correct
□ SRCH-032: NotFilter → excluded products not returned
□ SRCH-033/034: RangeFilter (greater than / between) → numeric filtering works
□ SRCH-035: Filter on nested property → nested path filtering works
```
