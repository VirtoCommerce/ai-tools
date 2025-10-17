# Test Case: TC-005 - Search Inventory by Product SKU

## Test Case Information

| Field | Value |
|-------|-------|
| **Test Case ID** | TC-005 |
| **Test Case Name** | Search Inventory by Product SKU |
| **Related Story** | [VCST-2585](https://virtocommerce.atlassian.net/browse/VCST-2585) |
| **Priority** | P1 - Critical |
| **Test Type** | Functional - Search |
| **Automation Status** | Manual |
| **Created By** | Test Team |
| **Created Date** | 2025-10-15 |
| **Module Version** | VirtoCommerce.Inventory_3.812.0-pr-155-41aa.zip |

## Objective
Verify that the inventory search functionality works correctly by Product SKU after migration to Generic Search services. Ensure that IInventorySearchService and IProductInventorySearchService return accurate results when searching by product identifiers.

## Preconditions
1. User is logged into VirtoCommerce Platform Admin
2. User has admin/inventory management permissions
3. Multiple inventory records exist with different product SKUs
4. Test data includes products with known SKUs
5. Test environment: https://vcst-qa.govirto.com/
6. Credentials: admin / Password3

## Test Data
- **Existing Product SKU 1**: TEST-LAPTOP-001 (should have inventory)
- **Existing Product SKU 2**: TEST-PHONE-001 (should have inventory)
- **Non-existent SKU**: NOEXIST-999 (should return no results)
- **Partial SKU**: TEST-LAP (for partial match testing)
- **Special Characters SKU**: TEST-PRODUCT_001 (if exists with special chars)

## Test Steps

| Step # | Action | Expected Result |
|--------|--------|-----------------|
| 1 | Navigate to https://vcst-qa.govirto.com/ | Platform admin login page loads |
| 2 | Login with admin credentials (admin / Password3) | Successfully logged in, dashboard displayed |
| 3 | Navigate to "Inventory" module or search interface | Inventory management page loads |
| 4 | Locate search/filter interface for inventory | Search functionality is visible |
| 5 | Verify "Product SKU" search field or filter is available | SKU search field is present |
| 6 | Enter complete SKU "TEST-LAPTOP-001" in search field | Text is entered successfully |
| 7 | Click "Search" or press Enter | Search is executed |
| 8 | Observe search results | Results are displayed |
| 9 | Verify results contain inventory for TEST-LAPTOP-001 | Correct product inventory is shown |
| 10 | Verify result shows: Product Name | Product name is displayed |
| 11 | Verify result shows: SKU | SKU "TEST-LAPTOP-001" is shown |
| 12 | Verify result shows: Fulfillment Center(s) | Fulfillment center(s) displayed |
| 13 | Verify result shows: In Stock quantities | Stock quantities are shown |
| 14 | Count number of results | Only matching records are returned |
| 15 | Clear search and enter "TEST-PHONE-001" | New search term entered |
| 16 | Execute search | Search is executed |
| 17 | Verify results contain inventory for TEST-PHONE-001 | Different product inventory is shown |
| 18 | Verify previous results (TEST-LAPTOP-001) are not shown | Results are filtered correctly |
| 19 | Clear search and enter partial SKU "TEST-LAP" | Partial term entered |
| 20 | Execute search | Search is executed |
| 21 | Verify results include products matching partial SKU | Partial matching works (if supported) |
| 22 | Clear search and enter non-existent SKU "NOEXIST-999" | Invalid SKU entered |
| 23 | Execute search | Search is executed |
| 24 | Verify "No results found" message is displayed | Clear no results message shown |
| 25 | Verify empty results list (no inventory records shown) | No records displayed |
| 26 | Clear search filter | Search is cleared |
| 27 | Verify all inventory records are displayed again | Full list is restored |

## Expected Results

### Visual Elements
- **Search Interface**: Clear search field for SKU input
- **Search Button**: Visible search/filter button or auto-search
- **Results Display**: Clear presentation of search results
- **Result Details**: Product name, SKU, fulfillment center, quantities
- **No Results Message**: User-friendly message when no matches found
- **Clear/Reset**: Option to clear search and show all records

### Functional Behavior
- Search uses IInventorySearchService correctly
- Search uses IProductInventorySearchService for product-based queries
- Exact SKU match returns correct results
- Partial SKU match works (if supported by system)
- Non-existent SKU returns empty results with message
- Search is case-insensitive (or clearly case-sensitive with documentation)
- Search results load quickly (< 2 seconds)
- Multiple inventory records for same SKU (different FCs) all appear
- No errors or exceptions in browser console
- No server-side errors in application logs

### Data Integrity
- All matching inventory records are returned
- No false positives (unrelated products)
- No false negatives (missing matching products)
- Associated data (fulfillment center, quantities) is accurate
- Search results can be opened for detailed view
- Pagination works correctly for large result sets (if applicable)

## Actual Results
_To be filled during test execution_

## Status
- [ ] Pass
- [ ] Fail
- [ ] Blocked
- [ ] Not Executed

## Test Evidence
_Attach screenshots here:_
- [ ] Search interface
- [ ] Search by exact SKU (TEST-LAPTOP-001) - results
- [ ] Search by different SKU (TEST-PHONE-001) - results
- [ ] Search by partial SKU - results
- [ ] Search by non-existent SKU - no results
- [ ] Cleared search - all results restored

## Notes/Comments
_Add any additional observations or issues encountered_

**Service Under Test**: 
- IInventorySearchService (migrated to Generic Search)
- IProductInventorySearchService (migrated to Generic Search)

**Migration Impact**: This test verifies the Search service implementation after Generic Search migration.

## Defects Found
_Link any related defects discovered during execution_

## Browser/Device Tested
- [ ] Chrome (Windows)
- [ ] Firefox (Windows)
- [ ] Edge (Windows)

## Validation Checklist
- [ ] Search field is easily accessible
- [ ] Search executes without errors
- [ ] Exact SKU match returns correct results
- [ ] Search results show all relevant fields
- [ ] Non-existent SKU shows "no results" message
- [ ] Search can be cleared/reset
- [ ] Results are accurate (no false positives)
- [ ] All matching records are returned (no false negatives)
- [ ] Performance is acceptable (< 2 seconds)
- [ ] Multiple FCs for same product all appear
- [ ] No console errors
- [ ] No server errors in logs

## Related Test Cases
- TC-001: Create New Inventory Record (create records to search)
- TC-002: View/Read Inventory Details (open search results)
- TC-006: Search Inventory by Fulfillment Center (different search criteria)
- TC-007: Advanced Inventory Search with Filters (combined search criteria)
- TC-010: Product Indexing with Inventory Data (search relies on indexing)

## Additional Scenarios to Test

### Scenario 1: Case Sensitivity
- Search for "test-laptop-001" (lowercase)
- Search for "TEST-LAPTOP-001" (uppercase)
- Search for "Test-Laptop-001" (mixed case)
- Verify all return same results (or document case-sensitive behavior)

### Scenario 2: SKU with Special Characters
- Search for product with underscore: TEST_PRODUCT_001
- Search for product with hyphen: TEST-PRODUCT-001
- Verify special characters are handled correctly

### Scenario 3: Leading/Trailing Spaces
- Search for " TEST-LAPTOP-001 " (with spaces)
- Verify system trims spaces or handles gracefully
- Verify results are still accurate

### Scenario 4: Wildcard Search (if supported)
- Search for "TEST-*" or "TEST-%"
- Verify wildcard functionality (if supported)
- Document wildcard support

### Scenario 5: Product with Multiple Inventory Records
- Search for product with inventory in 5 different fulfillment centers
- Verify all 5 inventory records are returned
- Verify each shows correct fulfillment center

### Scenario 6: Recently Created Inventory
- Create new inventory record
- Immediately search for it by SKU
- Verify it appears in search results (check indexing delay)

## Performance Considerations
- [ ] Search with 1 result - time: _____ ms
- [ ] Search with 10 results - time: _____ ms
- [ ] Search with 100+ results - time: _____ ms
- [ ] Search with no results - time: _____ ms

Target: All searches should complete in < 2 seconds

