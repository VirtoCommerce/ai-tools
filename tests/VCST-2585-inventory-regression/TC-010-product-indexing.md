# Test Case: TC-010 - Product Indexing with Inventory Data

## Test Case Information

| Field | Value |
|-------|-------|
| **Test Case ID** | TC-010 |
| **Test Case Name** | Product Indexing with Inventory Data |
| **Related Story** | [VCST-2585](https://virtocommerce.atlassian.net/browse/VCST-2585) |
| **Priority** | P1 - Critical |
| **Test Type** | Integration - Indexing |
| **Automation Status** | Manual |
| **Created By** | Test Team |
| **Created Date** | 2025-10-15 |
| **Module Version** | VirtoCommerce.Inventory_3.812.0-pr-155-41aa.zip |

## Objective
Verify that product indexing correctly includes inventory data after migration to Generic CRUD and Search services. Ensure that IProductInventorySearchService properly integrates with the indexing process and that search results contain accurate, up-to-date inventory information.

## Preconditions
1. User is logged into VirtoCommerce Platform Admin
2. User has admin/catalog management permissions
3. Products with inventory exist in the system
4. Product indexing functionality is accessible
5. Test environment: https://vcst-qa.govirto.com/
6. Credentials: admin / Password3

## Test Data
- **Test Product 1**: TEST-INDEX-PRODUCT-001
  - Fulfillment Center: Main Warehouse
  - In Stock: 100
  - Status: In Stock
- **Test Product 2**: TEST-INDEX-PRODUCT-002
  - Fulfillment Center: Main Warehouse
  - In Stock: 0
  - Status: Out of Stock
- **Test Product 3**: TEST-INDEX-PRODUCT-003
  - Fulfillment Center: Main Warehouse
  - In Stock: 5
  - Status: Low Stock

## Test Steps

| Step # | Action | Expected Result |
|--------|--------|-----------------|
| 1 | Navigate to https://vcst-qa.govirto.com/ | Platform admin login page loads |
| 2 | Login with admin credentials (admin / Password3) | Successfully logged in, dashboard displayed |
| 3 | **Setup: Prepare Test Products** | |
| 4 | Navigate to "Catalog" → "Products" | Products page loads |
| 5 | Verify TEST-INDEX-PRODUCT-001 exists with inventory | Product exists with 100 in stock |
| 6 | Verify TEST-INDEX-PRODUCT-002 exists with 0 stock | Product exists, out of stock |
| 7 | Verify TEST-INDEX-PRODUCT-003 exists with 5 stock | Product exists, low stock |
| 8 | **Trigger Product Indexing** | |
| 9 | Navigate to "Settings" → "Search" or "Indexing" | Indexing management page loads |
| 10 | Locate "Product Index" or "Catalog Index" section | Index section is visible |
| 11 | Click "Rebuild Index" or "Reindex Products" button | Confirmation dialog may appear |
| 12 | Confirm indexing operation | Indexing process starts |
| 13 | Observe indexing progress | Progress indicator shown |
| 14 | Wait for indexing to complete | "Indexing completed successfully" message |
| 15 | Note indexing completion time | Time recorded: _____ |
| 16 | **Verify Index Status** | |
| 17 | Check index status page | Status shows "Healthy" or "Complete" |
| 18 | Verify index document count | Count matches product count |
| 19 | Check for any indexing errors | No errors reported |
| 20 | **Test Search with Inventory Data** | |
| 21 | Navigate to Storefront or Product Search | Search interface loads |
| 22 | Search for "TEST-INDEX-PRODUCT-001" | Product appears in results |
| 23 | Verify search result shows "In Stock" status | In Stock indicator visible |
| 24 | Verify search result shows stock quantity (if shown) | Shows 100 or "In Stock" |
| 25 | Click on product to view details | Product page loads |
| 26 | Verify product page shows correct inventory | Inventory data matches (100 in stock) |
| 27 | Return to search, search for "TEST-INDEX-PRODUCT-002" | Out of stock product found |
| 28 | Verify search result shows "Out of Stock" status | Out of Stock indicator visible |
| 29 | Verify out of stock products can be filtered | Filter works correctly |
| 30 | Search for "TEST-INDEX-PRODUCT-003" | Low stock product found |
| 31 | Verify low stock indicator (if applicable) | Low stock shown correctly |
| 32 | **Test Inventory Update → Reindex** | |
| 33 | Navigate to admin → TEST-INDEX-PRODUCT-001 | Product admin page loads |
| 34 | Update inventory: Change from 100 to 150 | Inventory updated successfully |
| 35 | Trigger incremental reindex or wait for auto-index | Index update triggered |
| 36 | Search for product again | Product found in search |
| 37 | Verify search shows updated inventory (150) | Updated inventory in search results |
| 38 | **Test Stock Status Changes in Index** | |
| 39 | Update TEST-INDEX-PRODUCT-002 from 0 to 50 | Inventory updated (now in stock) |
| 40 | Trigger reindex | Index update triggered |
| 41 | Search for product | Product found |
| 42 | Verify status changed from "Out of Stock" to "In Stock" | Status updated in index |
| 43 | **Test Fulfillment Center Filter in Search** | |
| 44 | Navigate to search with FC filter (if available) | Search loads |
| 45 | Filter by "Main Warehouse" | Filter applied |
| 46 | Verify all test products appear (all in Main WH) | All test products shown |
| 47 | Filter by different FC (e.g., "East Coast DC") | Filter applied |
| 48 | Verify test products don't appear (not in that FC) | Correct filtering |

## Expected Results

### Functional Behavior
- Product indexing process completes successfully
- Indexing includes all inventory data for products
- Index reflects current inventory status (In Stock, Out of Stock, Low Stock)
- Index includes fulfillment center information
- Index includes stock quantities
- Product search returns results with inventory data
- Inventory status is searchable/filterable
- Inventory updates trigger index updates
- Index updates reflect in search results
- No errors during indexing process
- Performance is acceptable

### Data Integrity in Index
- **Inventory Status**: Correctly reflects product stock status
- **Stock Quantities**: Accurate quantities in index (if indexed)
- **Fulfillment Centers**: FC associations are indexed
- **Multiple FCs**: Products in multiple FCs are indexed correctly
- **Real-time Updates**: Index updates when inventory changes
- **Consistency**: Index data matches database data
- **No Orphans**: No indexed products with missing inventory

### Search Functionality
- Search results include inventory indicators
- In Stock products are distinguishable
- Out of Stock products are marked clearly
- Low Stock products are indicated (if feature exists)
- Stock status is filterable
- Fulfillment center is filterable (if feature exists)
- Search performance is good (< 2 seconds)

## Actual Results
_To be filled during test execution_

## Status
- [ ] Pass
- [ ] Fail
- [ ] Blocked
- [ ] Not Executed

## Test Evidence
_Attach screenshots here:_
- [ ] Indexing configuration page
- [ ] Indexing in progress
- [ ] Indexing completion message
- [ ] Search result showing In Stock product
- [ ] Search result showing Out of Stock product
- [ ] Search result showing Low Stock product
- [ ] Updated inventory reflected in search
- [ ] Stock status filter in action

**Indexing Details:**
- Total products indexed: _____
- Indexing duration: _____ minutes
- Index size: _____ MB
- Indexing errors: _____ (should be 0)

## Notes/Comments
_Add any additional observations or issues encountered_

**Services Under Test**: 
- IProductInventorySearchService (migrated to Generic Search)
- Product Indexing Integration with Inventory Module

**Migration Impact**: This test verifies that the Generic Search services properly integrate with product indexing, ensuring inventory data flows correctly into the search index.

## Defects Found
_Link any related defects discovered during execution_

## Browser/Device Tested
- [ ] Chrome (Windows)
- [ ] Firefox (Windows)
- [ ] Edge (Windows)

## Validation Checklist
- [ ] Indexing process starts without errors
- [ ] Indexing completes successfully
- [ ] All products are indexed
- [ ] Inventory data is included in index
- [ ] Search results show inventory status
- [ ] In Stock products are identifiable
- [ ] Out of Stock products are marked
- [ ] Low Stock indicators work (if applicable)
- [ ] Inventory updates trigger reindex
- [ ] Updated inventory appears in search
- [ ] Stock status is filterable
- [ ] Fulfillment center is indexed
- [ ] Performance is acceptable
- [ ] No indexing errors
- [ ] No console errors
- [ ] No server errors in logs

## Related Test Cases
- TC-002: View/Read Inventory Details (verify source data)
- TC-003: Update Inventory Information (update then verify index)
- TC-005: Search Inventory by Product SKU (admin search)
- TC-007: Advanced Inventory Search with Filters (admin search with filters)

## Index Verification Matrix

| Product | Expected Stock | Expected Status | In Index? | Stock Correct? | Status Correct? |
|---------|----------------|-----------------|-----------|----------------|-----------------|
| TEST-INDEX-PRODUCT-001 | 100 | In Stock | ☐ | ☐ | ☐ |
| TEST-INDEX-PRODUCT-002 | 0 | Out of Stock | ☐ | ☐ | ☐ |
| TEST-INDEX-PRODUCT-003 | 5 | Low Stock | ☐ | ☐ | ☐ |

## Additional Scenarios

### Scenario 1: Bulk Inventory Update → Reindex
- Update inventory for 50 products
- Trigger reindex
- Verify all 50 products have updated inventory in search
- Verify performance is acceptable

### Scenario 2: New Product with Inventory
- Create new product
- Add inventory to product
- Trigger reindex
- Search for new product
- Verify inventory data is in search results

### Scenario 3: Delete Inventory → Reindex
- Product has inventory
- Delete inventory record
- Trigger reindex
- Search for product
- Verify appropriate status (Out of Stock or No Inventory)

### Scenario 4: Multiple Fulfillment Centers in Index
- Product has inventory in 3 FCs
- Trigger reindex
- Search for product
- Verify all FC inventory is indexed/searchable

### Scenario 5: Incremental Index Update
- Make small inventory change (1 product)
- Trigger incremental reindex (if supported)
- Verify only changed product is reindexed
- Verify performance is fast

### Scenario 6: Index After Import
- Import inventory data (bulk)
- Trigger reindex
- Verify imported data is in index
- Verify search reflects imported inventory

## Performance Considerations
- Full reindex time: _____ minutes
- Incremental reindex time: _____ seconds
- Search response time (with inventory): _____ ms
- Index size increase with inventory data: _____ %

**Acceptable Performance:**
- Full reindex (1000 products): < 5 minutes
- Incremental reindex (10 products): < 30 seconds
- Search response: < 1 second

## Technical Verification

**Check Index Fields (using admin tools or API):**
- [ ] `inStock` field exists
- [ ] `stockQuantity` field exists (if applicable)
- [ ] `fulfillmentCenterId` field exists
- [ ] `fulfillmentCenterName` field exists
- [ ] Inventory fields are searchable
- [ ] Inventory fields are filterable
- [ ] Index mapping is correct

