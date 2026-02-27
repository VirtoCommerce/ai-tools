# Data Import/Export Test Cases

> Reference file for qa-backend-expert agent. Read when testing CSV import/export (Suite 29 - 18 tests).

## CSV Import Testing (CSVIO-001 to CSVIO-012)

```markdown
# CSVIO-001: Import catalog — categories and items (general)
1. Navigate to Catalog > Import
2. Upload CSV file with categories and items
3. Start import → wait for completion
4. Verify imported data in catalog
✅ Categories and items imported correctly from CSV

# CSVIO-002: Import catalog — creation of new items
1. Upload CSV with new product items (SKUs not in system)
2. Start import
3. Verify new items created in catalog with correct properties
✅ New items created matching CSV data

# CSVIO-003: Import subcategories (single and multiple levels)
1. Upload CSV with 1 subcategory level → verify hierarchy
2. Upload CSV with multiple subcategory levels → verify deep hierarchy
✅ Subcategory hierarchies imported correctly at all levels

# CSVIO-004: Import catalog — update existing items
1. Upload CSV with updated values for existing products
2. Start import
3. Verify existing items updated (names, prices, descriptions changed)
✅ Existing items updated with new values from CSV

# CSVIO-005: Import multiple product images via CSV
1. Upload CSV with multiple image URLs per product
2. Import → verify images attached to products in Admin
✅ Multiple product images imported and attached correctly

# CSVIO-006: Import multilanguage product descriptions
1. Upload CSV with product descriptions in EN, DE, FR, etc.
2. Import → switch language in Admin → verify all locales
✅ Product descriptions imported for all specified languages

# CSVIO-007: Full round-trip — export products then reimport
1. Export products to CSV
2. Modify some values in exported CSV
3. Reimport modified CSV
4. Verify changes applied correctly
✅ Full round-trip export/import works without data loss

# CSVIO-008: Import with different column delimiters
1. Import with Vertical bar (|) delimiter
2. Import with Comma (,) delimiter
3. Import with Tab delimiter
4. Import with Semicolon (;) delimiter
✅ All delimiter types parsed and imported correctly

# CSVIO-009: Import user permissions (RBAC)
1. Login as user WITH import permission → attempt import → allowed
2. Login as user WITHOUT import permission → attempt import → denied
✅ Import access controlled by user permissions

# CSVIO-010: Import SEO properties (creation and update)
1. Import CSV with SEO slug, meta title, meta description for new items
2. Import CSV updating SEO for existing items
✅ SEO properties created and updated via CSV import

# CSVIO-011: Import common properties (updating and creating)
1. Import CSV with common (shared) properties for items
2. Verify properties created/updated on products
✅ Common properties imported correctly

# CSVIO-012: Import multilanguage property values
1. Import CSV with multilanguage property values
2. Switch Admin to each language → verify property values per locale
✅ Multilanguage property values imported for all locales
```

## CSV Export Testing (CSVIO-013 to CSVIO-018)

```markdown
# CSVIO-013: Export catalog — general (Critical)
1. Navigate to Catalog > select products/categories
2. Click Export → choose CSV format
3. Download exported file
4. Open CSV → verify correct product data, columns, encoding
✅ CSV export file generated with correct product data

# CSVIO-014: Export from category and subcategory
1. Export from top-level category → verify CSV contains only its products
2. Export from subcategory → verify CSV contains only subcategory products
✅ Category-level exports contain correct product scope

# CSVIO-015: Export single physical product
1. Select one physical product → Export to CSV
2. Verify all properties present (name, SKU, price, weight, dimensions, images)
✅ Single product exported with all properties

# CSVIO-016: Export digital and BOM products
1. Export a digital product → verify CSV format for digital type
2. Export a BOM (Bill of Materials) product → verify components listed
✅ Digital and BOM product types exported correctly

# CSVIO-017: Export with fulfillment center and pricelist selection
1. Select products → choose specific Fulfillment Center and PriceList in export options
2. Export → verify CSV includes only selected FFC inventory and pricelist prices
✅ Export respects FFC and pricelist selection

# CSVIO-018: Export 10 products bulk
1. Select 10 products in catalog
2. Export to CSV
3. Verify all 10 products present in export with complete data
✅ All selected products exported correctly
```

## Cross-Module Export Tests (from Pricing, Inventory, Orders suites)

```markdown
# PRICE-008: Export pricelist to CSV
1. Pricing > Pricelists > select pricelist > Export
2. Download CSV → verify price entries match Admin data
✅ Pricelist exported with correct price entries

# PRICE-031: Export products from Prices blade
1. Catalog > Product > Prices widget > Export
2. Verify CSV contains all price tiers and currencies for that product
✅ Per-product price export includes tiers and currency variants

# PRICE-042: Export pricelist assignment details
1. Pricelists > Assignment > Export
2. Verify catalog, currency, priority, conditions in export
✅ Assignment rules exported correctly

# INV-039: Export inventory from FFC
1. Inventory > Fulfillment Center > Inventory tab > Export
2. Verify stock quantities, reserved, reorder points in CSV
✅ Inventory data exported per FFC

# ORD-064: Export orders (if available)
1. Orders > select orders > Export
2. Verify order data: number, customer, items, totals, status
✅ Order export contains complete order details
```
