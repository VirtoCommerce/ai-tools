# Admin SPA CRUD Test Cases

> Reference file for qa-backend-expert agent. Read when testing Admin SPA functionality.

## Access Admin Panel
```
URL: ${BACK_URL} (from .env)
Login with test credentials
Navigate to module-specific blades (modal panels)
```

## A. Catalog CRUD (Suite 16 - 33+ tests)

Location: Catalog > Catalogs, Categories, Products

Key Test Cases (from 16-catalog-tests.csv):
- CAT-001: Add New Catalog - Fill name, configure languages, click Create
- CAT-002: Edit Existing Catalog - Right-click > Manage, modify name/language/property, Save
- CAT-003: Delete Catalog - Cancel confirmation (negative test)
- CAT-004: Delete Catalog - Type 'Yes' in confirmation, verify deletion cascades
- CAT-008: Add New Category - Fill required fields (Name, Code), add description/images/SEO
- CAT-012: Add Tax Type to Category - Edit dictionary values, add new tax type
- CAT-014: Add New Image to Category - Drag-drop upload, specify category/language/alt text
- CAT-015: Add New SEO to Category - Fill URL, Title, Meta Description, Keywords
- CAT-019: Add New Physical Product - Fill required (SKU, Name), add Property/Image/Description/SEO blocks
- CAT-020: Add New Digital Product - Verify SKU auto-generated, digital type persisted
- CAT-026: Clone Product - Verify all data copied, SKU auto-generated different from original
- CAT-027: Add Vendor to Product - Create vendors, assign, verify persistence on reopen
- CAT-032: Add Image with Alt Text - Upload image, fill Name/Category/Language/Alt/Meta fields

## B. Order Management (Suite 20 - 66 tests)

Location: Orders > All Orders

Key Test Cases (from 20-orders-tests.csv):
- ORD-001: Create new order - Fill customer, store, items, verify in list
- ORD-002: View and edit order details - Open blade, verify editable format, save changes
- ORD-004: Line items widget - Verify product info, quantities, prices
- ORD-009: Get invoice - Click 'Get Invoice', verify PDF generation and download
- ORD-011: Create order with configuration items - Verify View/Configuration/Discounts/DynProps tabs
- ORD-013: Payment document status changes - Change through available transitions
- ORD-017: Capture authorized payment (manual) - Capture > status changes to 'Paid'
- ORD-018: Capture fails for authorize.net/native methods (negative)
- ORD-020: Refund paid payment - Refund succeeds for 'Paid' status
- ORD-021: Refund non-paid payment fails (negative)
- ORD-028: Cancel order > adjust stock for single product FFC
- ORD-032: Assign employee from root org as order responsible > verify scoped access
- ORD-038: Validate order fields via API/Swagger (15+ fields)
- ORD-045: Number template with sequential {1} and padded CO{1:D5}
- ORD-052: Permission > Access - Verify orders:access shows Orders blade
- ORD-058: API delete order - assigned/unassigned/non-existent combinations

## C. Pricing Management (Suite 19 - 58 tests)

Location: Pricing > Price Lists, Assignments

Key Test Cases (from 19-pricing-tests.csv):
- PRICE-001: Create new price list - Enter name, select currency, click Create
- PRICE-005: Add products to price list - Select products, verify Prices widget count
- PRICE-006: Add prices (List/Sale/MinQty) - Add price tiers with different min quantities
- PRICE-009: Change price on Backend > verify updated on Storefront (integration)
- PRICE-010: Remove price > $0 shown, 'Unavailable' label, cannot add to cart
- PRICE-011: Price with highest priority shown on Storefront
- PRICE-013: Price changed when switching currency (USD/EUR) on Storefront
- PRICE-019: Verify pricelist assignment via GraphQL xAPI query
- PRICE-020: Validate description field length > 512 chars (negative, API)
- PRICE-021: Delete last price with min qty=1 > must keep at least one
- PRICE-024: Tiered pricing in cart - qty=1 (349/210), qty=4 (100), qty=10 (88/69)
- PRICE-027: Add new assignment - Select catalog + price list, no conditions
- PRICE-030: Assignments with rules and conditions - Eligible Shoppers section
- PRICE-053 to 058: Permission tests (Access, Read, Export, Create, Update, Delete)

## D. Inventory Management (Suite 22 - 43 tests)

Location: More > Inventory > Fulfillment Centers

Key Test Cases (from 22-inventory-tests.csv):
- INV-002: Add new fulfillment center - Fill Name/Location/OuterId/Address, Save
- INV-006: Edit FFC short description with Markdown and HTML table
- INV-010: Add address to FFC - Country (required), State, City, Address, Zip, Email, Phone
- INV-014: Add dynamic property - Choose type (Multivalue/Multilanguage/Dictionary)
- INV-018: Edit in stock quantity via Catalog > Product > Fulfillment centers widget
- INV-019: Order product > stock qty decreased (integration, Track inventory = TRUE)
- INV-020: Order more items than available > warning message
- INV-021: Available items from multiple FFCs > combined availability
- INV-022: In stock = 0 > 'Add to cart' inactive, 'Sold out' label shown
- INV-023: Add to cart > update inventory to 0 on backend > create order fails validation
- INV-024: Track inventory = FALSE > stock unchanged after order, no qty warnings
- INV-029: Add FFC with outerId via API (POST /api/inventory/fulfillmentcenters/batch)
- INV-031 to 037: Permission tests (Access, Read, Create, Update, Delete, FFC Edit/Delete via Store)
- INV-042/043: Event-based indexation enable/disable for inventory entities

## E. Search Indexing (Suite 26 - 40 tests)

Location: Search > Index Management

Key Test Cases (from 26-search-indexing-tests.csv):
- SRCH-001: Search by full product name (Elastic) > product found
- SRCH-004: Search with incorrect value > no results, appropriate empty state
- SRCH-007: Run index build > status shows completed
- SRCH-008: Rebuild index (blue-green) > both active and inactive indices built
- SRCH-010: Swap indexes > active/inactive indices swapped successfully
- SRCH-015: Create product then refresh index > new product reflected
- SRCH-016: Delete product then rebuild > deleted product no longer in results
- SRCH-023: Delete and rebuild index > old index deleted, new built from scratch
- SRCH-028 to 035: Search Filters API > TermFilter, OrFilter, AndFilter, NotFilter, RangeFilter
- SRCH-036: Settings - token filter and gram configuration
- SRCH-038: Settings - schedule indexing jobs with cron expression
- SRCH-040: Scalable indexation verification - multi-instance partitioning

## Admin SPA Blade System

```
Blades are Virto's sliding modal panels.

Test:
[] Blade opens correctly (no JavaScript errors)
[] Blade closes via X button
[] Blade closes via backdrop click
[] Multiple blades can stack
[] Blade breadcrumb navigation works
[] Blade doesn't break on browser back button
[] Blade state persists during navigation
[] Check Angular console for errors
[] Verify no memory leaks (blades clean up on close)
```
